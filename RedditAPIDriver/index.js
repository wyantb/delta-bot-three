import 'colors'
import formurlencoded from 'form-urlencoded'
import fetch from 'node-fetch'
import promisify from 'promisify-node'
const fs = require('fs')
fs.readFile = promisify(fs.readFile)

module.exports = class RedditAPIDriver {
  constructor(credentials) {
    this.credentials = credentials
    this.headers = {}
    this.baseURL = 'https://oauth.reddit.com'
  }
  async connect(options = { type: 'FIRST_CONNECTION' }) {
    const { type } = options
    if (type === 'GET_NEW_SESSION') {
      const { username, password, clientID, clientSecret } = this.credentials
      const auth = Buffer(`${clientID}:${clientSecret}`).toString('base64')
      let res = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Authorization': `Basic ${auth}`
        },
        body: formurlencoded({grant_type: 'password', username, password})
      })
      var json = await res.json()
      fs.writeFile('session.json', JSON.stringify(json, null, 2))
    } else if (type === 'FIRST_CONNECTION') {
      try {
        var json = JSON.parse(await fs.readFile('session.json', 'utf-8'))
      } catch (err) {
        return this.connect({type:'GET_NEW_SESSION'})
      }
    } else throw Error('This should never happen. Unhandled type for RedditAPIDriver.connect()')
    console.log('Getting session token!'.yellow)
    if (typeof json === 'object') console.log('Got token'.green)
    else throw Error('JSON was not an object')
    console.log(`${JSON.stringify(json, null, 2)}`.yellow)
    const { token_type, access_token } = json
    this.headers = {
      'authorization': `${token_type} ${access_token}`,
      'user-agent': `DB3/1.0.0 by MystK`
    }
    return true
  }
  async getNewSession() {
  }
  async query(params) {
    if (typeof params === 'string') {
      var URL = params
      var method = 'GET'
    } else var { URL, method } = params
    if (URL.indexOf('/comments') === -1) console.log(`REDDITAPI: QUERYING: ${method} ${URL}`.yellow)
    const headers = this.headers
    let response = await fetch(`${this.baseURL}${URL}`, { headers, method })
    let statusCode = response.status
    if (statusCode == 200) return await response.json()
    else if (statusCode == 401) {
      await this.connect({type: 'GET_NEW_SESSION'})
      return await this.query(URL)
    } else return await response.text()
  }
}