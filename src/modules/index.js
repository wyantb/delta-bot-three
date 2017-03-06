const _ = require('lodash')
const fs = require('fs')
const path = require('path')

const directoryFiles = fs.readdirSync(__dirname)
const pulledFilesFromdirectoryFiles = _.pull(directoryFiles, 'index.js', 'delta-bot-module.js')

module.exports = _.reduce(pulledFilesFromdirectoryFiles, (result, fileName) => {
  const keyName = _.chain(fileName).trimEnd('.js').camelCase().value()
  const fullFilePath = path.join(__dirname, fileName)
  result[keyName] = require(fullFilePath)
  return result
}, {})
