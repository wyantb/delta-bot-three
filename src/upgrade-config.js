const _ = require('lodash')
const mkdirp = require('mkdirp')
const fs = require('mz/fs')
const path = require('path')

const configJsonScaffold = {
  subreddit: 'YOUR_DEVELOPMENT_CHANGEMYVIEW_SUBREDDIT_HERE',
  deltaLogSubreddit: 'YOUR_DEVELOPMENT_DELTALOG_SUBREDDIT_HERE',
}
const credentialsJsonScaffold = {
  username: 'Your Reddit username',
  password: 'Your Reddit password',
  clientId: 'Your application ID',
  clientSecret: 'Your application secret',
}

let exit
const logAndCreateScaffoldConfig = async ({ json, folderPath, fileName }) => {
  mkdirp.sync(folderPath)
  await fs.writeFile(`${folderPath}${fileName}`, JSON.stringify(json, null, 2))
  console.log('You\'re missing a config file!')
  console.log('We\'ve created one for you! Please open it and make changes to the scaffolded values!')
  console.log(`PATH: ${folderPath}${fileName}`)
  exit = true
}

const throwScaffoldConfigError = (fileName) => {
  console.log('You did not fill out a config file with your own values yet!')
  console.log(`FILE: ${fileName}`)
  exit = true
}

// checks if the config files exist and provide a message and exit if they do not
module.exports = async () => {
  // check if credentials.json exist and throw an error if it doesn't
  const credentialsFilePath = path.join(process.cwd(), 'config/credentials/credentials.json')
  let credentialsJson
  try {
    credentialsJson = JSON.parse(await fs.readFile(credentialsFilePath))
  } catch (err) {
    await logAndCreateScaffoldConfig({
      json: credentialsJsonScaffold,
      folderPath: './config/credentials/',
      fileName: 'credentials.json',
    })
  }
  if (_.isEqual(credentialsJson, credentialsJsonScaffold)) throwScaffoldConfigError('credentials.json')

  // check if there is the subreddit and deltaLogSubreddit key in credentialsJson
  // if there is, it is a legacy config and we convert it to the new one
  // if there isn't, it is the new config but it is missing the config.json file
  // throw an error and exit
  const configJsonPath = path.join(process.cwd(), 'config/config.json')
  if (
    credentialsJson &&
      'subreddit' in credentialsJson &&
      'deltaLogSubreddit' in credentialsJson
  ) {
    await fs.writeFile(configJsonPath, JSON.stringify({
      subreddit: credentialsJson.subreddit,
      deltaLogSubreddit: credentialsJson.deltaLogSubreddit,
    }, null, 2))
  }

  // now check if config exists and throw an error if it doesn't
  let configJson
  try {
    configJson = JSON.parse(await fs.readFile(configJsonPath))
  } catch (err) {
    await logAndCreateScaffoldConfig({
      json: configJsonScaffold,
      folderPath: './config/',
      fileName: 'config.json',
    })
  }
  if (_.isEqual(configJson, configJsonScaffold)) throwScaffoldConfigError('config.json')

  if (exit) process.exit()

  // look at the module specific configs and change them too if they are legacy configs
  const directoryFileNames = await fs.readdir(path.join(process.cwd(), 'config/credentials'))
  let changed
  for (const fileName of directoryFileNames) {
    const modCredsFilePath = path.join(process.cwd(), 'config/credentials', fileName)
    const modCredsJson = JSON.parse(await fs.readFile(credentialsFilePath))
    changed = false
    if ('subreddit' in modCredsJson) {
      delete modCredsJson.subreddit
      changed = true
    }
    if ('deltaLogSubreddit' in modCredsJson) {
      delete modCredsJson.deltaLogSubreddit
      changed = true
    }
    if ('clientID' in modCredsJson) {
      modCredsJson.clientId = modCredsJson.clientID
      delete modCredsJson.clientID
      changed = true
    }
    if (changed) await fs.writeFile(modCredsFilePath, JSON.stringify(modCredsJson, null, 2))
  }
  if (changed) console.log('Upgraded config(s)!')
}
