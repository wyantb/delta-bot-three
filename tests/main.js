process.env.BABEL_ENV = 'testing'
/* eslint-disable import/no-extraneous-dependencies */
require('babel-register')
/* eslint-enable import/no-extraneous-dependencies */

exports.users = require('./users.js')
