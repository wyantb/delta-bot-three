import 'colors'
import formurlencoded from 'form-urlencoded'
import fetch from 'node-fetch'
import promisify from 'promisify-node'
import _ from 'lodash'
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
          'user-agent': `DB3/1.0.0 by MystK`,
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
    this.headersNoAuth = {
      'user-agent': `DB3/1.0.0 by MystK`
    }
    return true
  }
  async getNewSession() {
  }
  async query(params, notFirst) {
    let done = false
    try {
      if (!notFirst) setTimeout(f => {
        console.log('timed out!', params)
        console.log(done)
        if (!done) return { error: 'timed out' }
      }, 600000)
      const headers = this.headers
      const headersNoAuth = this.headersNoAuth
      let response
      if (typeof params === 'string' && params.indexOf('/comments') > -1) {
        let URL = `https://www.reddit.com${params}`
        if (URL.indexOf('?') > -1) URL = URL.replace('?', '.json?')
        else URL += '.json'
        response = await fetch(URL, { headersNoAuth })
      } else if (typeof params === 'string')  {
        let URL = `${this.baseURL}${params}`
        response = await fetch(`${URL}`, { headers })
      } else {
        const { URL, method, body } = params
        console.log(`REDDITAPI: QUERYING: ${method} ${this.baseURL}${URL}`.yellow)
        response = await fetch(`${this.baseURL}${URL}`, { headers, method, body })
      }
      let statusCode = response.status
      if (statusCode !== 200) console.log(statusCode)
      if (statusCode === 200) {
        done = true
        return await response.json()
      } else if (statusCode == 401 || statusCode == 403) {
        console.log('75 R_API')
        await this.connect({type: 'GET_NEW_SESSION'})
        return await this.query(params, true)
      } else if (statusCode == 502 || statusCode == 503 || statusCode == 500) {
        console.log('80 R_API')
        return await this.query(params, true)
      } else {
        const text = await response.text()
        console.log('74 R_API')
        console.log(text)
        done = true
        return text
      }
    } catch (err) {
      console.log('89 R_API')
      console.log(err)
    }
  }
}