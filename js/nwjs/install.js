'use strict'

/**
 * Module dependencies
 */
const path = require('path');
const co = require('co');
const os = require('./os');
const pget = require('pget');
const home = require('user-home');
const extract = require('extract-zip');
const pify = require('pify');
const exists = require('path-exists');
const figures = require('figures');
const config = require('./config');
const fs = require('fs');
const getNwjsName = require('./get-nwjs-name');
const {exec} = require('shelljs');

module.exports = co.wrap(function* (version) {
  try {
    // Create cache dir
    const cacheDir = path.join(home, '.nwjs');
    try { fs.mkdirSync(cacheDir); } catch(e) {}
    // check if has cached nwjs in this version
    if (exists.sync(`${cacheDir}/${version}`)) {
      return console.log(`A cached nwjs already located in ${cacheDir}/${version}`.red);
    }
    const name = getNwjsName(version);
    // Download the nwjs
    yield pget(name.url, {dir: cacheDir, target: `${version}.${name.ext}`, verbose: true, proxy: process.env.HTTP_PROXY});
    // extract both zip and tarball
    const from = `${cacheDir}/${version}.${name.ext}`;
    if (os.platform === 'linux') {
      exec(`tar -xzvf ${from} -C ${cacheDir}`, {silent: true});
    } else {
      yield pify(extract)(from, {dir: cacheDir});
    }
    // remove zip

    fs.unlinkSync(from);
    // update the current using version
    config.set('current', version);
    // print success info
    console.log(`${figures.tick} Version ${version} is installed and activated`.green);
  } catch (e) {
    console.log(`Failed to install ${figures.cross} Version ${version}`.red);
    console.log(e.stack);
    throw e;
  }
});
