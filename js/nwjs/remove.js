'use strict'

/**
 * Module dependencies
 */
const home = require('user-home');
const config = require('./config');
const getNwjsName = require('./get-nwjs-name');
const {rm} = require('shelljs');

module.exports = function (version) {
    const current = config.get('current');

    if (current === version) {
      config.set('current', null);
    }

    const dir = `${home}/.nwjs/${getNwjsName(version).fileName}`;
    rm('-r', dir);
}
