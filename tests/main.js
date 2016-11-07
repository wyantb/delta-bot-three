process.env.BABEL_ENV = 'testing';
require('babel-register');

exports.users = require('./users.js');
