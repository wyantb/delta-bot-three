const fsp = require('fs-promise')
const _ = require('lodash')
const path = require('path')

const doMissingCredentialsJson = () => {
  console.log('You need a credentials.json file in ./config/credentials/credentials.json')
  console.log(`{
  "username": "Your Reddit username",
  "password": "Your Reddit password",
  "clientID": "Your application ID",
  "clientSecret": "Your application secret"
}`)
  console.log('We\'ve created one for you! Please fill it out with your required info')
}

const doMissingConfigJson = () => {
  console.log('You need a config.json file in ./config/config.json')
  console.log(`{
  "subreddit": "YOUR_DEVELOPMENT_CHANGEMYVIEW_SUBREDDIT_HERE",
  "deltaLogSubreddit": "YOUR_DEVELOPMENT_DELTALOG_SUBREDDIT_HERE"
}`)
}

// checks if the config files exist and provide a message and exit if they do not
module.exports = () => {
  // save the path of where the config should be
  const configJsonPath = path.join(process.cwd(), 'config/config.json')

  // check if the config exists and if it doesn't look for the legacy config
  try {
    // checks to see if the config exists and throws an error if it doesn't
    fsp.statSync(configJsonPath)
  } catch (expectedErr) { // config doesn't exist, lets check for the legacy config now
    // save the path of where the legacy config should be
    const credentialsFilePath = path.join(process.cwd(), 'config/credentials/credentials.json')
    // check to see if the legacy config exists and if it doesn't, throw an error and exit
    try {
      fsp.statSync(credentialsFilePath)
    } catch (expectedErr2) { // both configs don't exist, so throw an error and exit
      doMissingCredentialsJson()
      process.exit()
    }
    // we did not find the config but found the legacy config so let's migrate the legacy config
    // to the new one

    // read the legacy config
    const credentialsJson = fsp.readJsonSync(credentialsFilePath)
    // check if there is the subreddit and deltaLogSubreddit key
    // if there is, it is a legacy config and we convert it to the new one
    // if there isn't, it is the new config but it is missing the config.json file
    // throw an error and exit
    if (
      'subreddit' in credentialsJson &&
      'deltaLogSubreddit' in credentialsJson
    ) {
      fsp.writeJsonSync(configJsonPath, {
        subreddit: credentialsJson.subreddit,
        deltaLogSubreddit: credentialsJson.deltaLogSubreddit,
      })
    } else {
      doMissingConfigJson()
      process.exit()
    }
  }

  // look at the module specific configs and change them too if they are legacy configs
  const directoryFileNames = fsp.readdirSync(path.join(process.cwd(), 'config/credentials'))
  let changed
  _.forEach(directoryFileNames, (fileName) => {
    const credentialsFilePath = path.join(process.cwd(), 'config/credentials', fileName)
    const credentialsJson = fsp.readJsonSync(credentialsFilePath)
    changed = false
    if ('subreddit' in credentialsJson) {
      delete credentialsJson.subreddit
      changed = true
    }
    if ('deltaLogSubreddit' in credentialsJson) {
      delete credentialsJson.deltaLogSubreddit
      changed = true
    }
    if ('clientID' in credentialsJson) {
      credentialsJson.clientId = credentialsJson.clientID
      delete credentialsJson.clientID
      changed = true
    }
    if (changed) fsp.writeJsonSync(credentialsFilePath, credentialsJson)
  })
  if (changed) console.log('Upgraded config(s)!')
}
