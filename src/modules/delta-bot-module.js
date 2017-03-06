const fsp = require('fs-promise')
const path = require('path')
const Snoowrap = require('snoowrap')
const _ = require('lodash')
const { getUserAgent } = require('./../utils')

class DeltaBotModule {
  constructor(fileName, legacyRedditApi) {
    const configPath = path.join(process.cwd(), 'config/config.json')
    this.config = fsp.readJsonSync(configPath)
    this.botUserName = 'Not set yet!'
    this.subreddit = this.config.subreddit
    this.fileName = fileName.replace(__dirname, '').slice(1).slice(0, -3)
    this.moduleName = _.startCase(this.fileName)
    this.reddit = 'Not connected yet!'
    this.legacyRedditApi = legacyRedditApi
  }
  getAndSetCredentials() {
    try {
      const moduleCredentialsPath = path.join(
        process.cwd(),
        'config/credentials',
        `${this.fileName}.json`
      )
      return fsp.readJsonSync(moduleCredentialsPath)
    } catch (expectedError) {
      const defaultCredentialsPath = path.join(
        process.cwd(),
        'config/credentials/credentials.json'
      )
      return fsp.readJsonSync(defaultCredentialsPath)
    }
  }
  async login() {
    const credentials = this.getAndSetCredentials()
    this.botUsername = credentials.username
    const userAgent = getUserAgent(this.moduleName)
    this.reddit = new Snoowrap(_.assign(credentials, { userAgent }))
  }
  async start() {
    await this.login()
  }
}
module.exports = DeltaBotModule
