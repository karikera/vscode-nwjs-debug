'use strict';

/**
 * Module dependencies
 */
const home = require('user-home');
const {rm, exec} = require('shelljs');
const co = require('co');
const path = require('path');
const fs = require('fs');
const getVersions = require('nwjs-versions');
const pget = require('pget');
const extract = require('extract-zip');
const pify = require('pify');
const exists = require('path-exists');
const figures = require('figures');
const isSemver = require('is-semver');
const os = require('./os');

const nwjs = module.exports = {
    defaultVersion: '0.14.7',
    /**
     * @param {string} version
     * @return {boolean}
     */
    exists: function(version)
    {
        return nwjs.getRootPath(version) !== null;
    },
    /**
     * @param {string} version
     * @return {?string}
     */
    getRootPath: function(version)
    {
        const nw = path.join(home, '.nwjs', nwjs.getName(version).fileName);
        if (!fs.existsSync(nw)) return null;
        return nw;
    },
    /**
     * @param {string} version
     * @return {?string}
     */
    getNwjc: function (version) {
        const root = nwjs.getRootPath(version);
        if (root === null) return null;

        let nw;
        switch(os.platform)
        {
        case 'osx': nw = 'nwjc'; break;
        case 'win': nw = 'nwjc.exe'; break;
        default: nw = 'nwjc'; break;
        }
        return path.join(root, nw);
    },
    /**
     * @param {string} version
     * @return {?string}
     */
    getPath: function (version) {
        const root = nwjs.getRootPath(version);
        if (root === null) return null;

        let nw;
        switch(os.platform)
        {
        case 'osx': nw = 'nwjs.app/Contents/MacOS/nwjs'; break;
        case 'win': nw = 'nw.exe'; break;
        default: nw = 'nw'; break;
        }
        return path.join(root, nw);
    },
    /**
     * @param {string} version
     */
    getName: function(version)
    {
        const realVersion = version.split('-sdk').shift();
        const fileName = version == realVersion ? `nwjs-v${realVersion}-${os.platform}-${os.arch}` : `nwjs-sdk-v${realVersion}-${os.platform}-${os.arch}`;
        const ext = os.platform === 'linux' ? 'tar.gz' : 'zip';
        const url = `http://dl.nwjs.io/v${realVersion}/${fileName}.${ext}`;
        return {realVersion, fileName, ext, url};
    },
    /**
     * @param {string} version
     * @return {boolean}
     */
    remove: function (version) {
        if (!nwjs.exists(version)) return false;
        rm('-r', `${home}/.nwjs/${nwjs.getName(version).fileName}`);
        return true;
    },
    /**
     * @return {!Promise<!Array<string>>}
     */
    listAll: co.wrap(function* () {
        try
        {
            const versions = yield getVersions();
            return versions.map(v => `  ${v}`);
        }
        catch (e)
        {
            console.log(e.stack);
            throw e;
        }
    }),
    /**
     * @return {!Promise<!Array<string>>}
     */
    list: co.wrap(function* () {
        try {
            const versions = yield pify(fs).readdir(`${home}/.nwjs`);
            return versions.filter(v => isSemver(v)).map(v => `  ${v}`);
        } catch (e) {
            console.log(e.stack);
            throw e;
        }
    }),

    /**
     * @param {string} version
     * @return {!Promise<boolean>}
     */
    install: co.wrap(function* (version) {
        try {
            console.log("Download NWjs("+version+")...");

            if (nwjs.exists(version)) return false;

            // Create cache dir
            const cacheDir = path.join(home, '.nwjs');
            try { fs.mkdirSync(cacheDir); } catch(e) {}
            // check if has cached nwjs in this version
            if (exists.sync(`${cacheDir}/${version}`)) {
            return console.log(`A cached nwjs already located in ${cacheDir}/${version}`.red);
            }
            const name = nwjs.getName(version);
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
            // print success info
            console.log(`${figures.tick} Version ${version} is installed and activated`.green);
            return true;
        } catch (e) {
            console.log(`Failed to install ${figures.cross} Version ${version}`.red);
            console.log(e.stack);
            throw e;
        }
    })
};