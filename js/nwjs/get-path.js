'use strict'
const path = require('path');
const home = require('user-home');
const platform = require('./os').platform;
const config = require('./config');
const getNwjsName = require('./get-nwjs-name');

module.exports = function () {
    const version = config.get('current');

    if (version) {
        let nw
        if (platform === 'osx') {
            nw = 'nwjs.app/Contents/MacOS/nwjs';
        } else if (platform === 'win') {
            nw = 'nw.exe';
        } else {
            nw = 'nw';
        }
        nw = path.join(home, '.nwjs', getNwjsName(version).fileName, nw);

        return nw;
    }

    return null;
};