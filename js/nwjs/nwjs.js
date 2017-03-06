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
const nugget = require('nugget')
const extract = require('extract-zip');
const pify = require('pify');
const os = require('./os');


/**
 * @param {string} version
 */
function splitVersionInfo(version)
{
    const extidx = version.indexOf('-');
    var ext = '';
    if (extidx !== -1)
    {
        ext = version.substr(extidx+1);
        version = version.substr(0, extidx);
    }
    version = version.split('.').map(v=>+v);
    return {version, ext};
}

/**
 * @param {string} a
 * @param {string} bin
 * @return {number}
 */
function versionCompare(a, b)
{
    a = splitVersionInfo(a);
    b = splitVersionInfo(b);
    const count = Math.min(a.version.length, b.version.length);
    for(var i=0;i<count;i++)
    {
        const delta = b.version[i] - a.version[i];
        if (delta !== 0) return delta;
    }
    const delta = b.version.length - a.version.length;
    if (delta !== 0) return delta;
    return b.ext.localeCompare(a.ext);
}

/**
 * @template T
 * @param {T[]} array
 * @param {function(T,T):number}
 * @return {T|undefined}
 */
function getFirstOfArray(array, cmp)
{
    if (array.length === 0) return undefined;
    var v = array[0];
    for(var i=1;i<array.length;i++)
    {
        const v2 = array[i];
        if (cmp(v, v2) > 0) v = v2;
    }
    return v;
}


const nwjs = module.exports = {
    /**
     * @param {string} version
     * @return {boolean}
     */
    exists(version)
    {
        return nwjs.getRootPath(version) !== null;
    },
    /**
     * @param {string} version
     * @return {?string}
     */
    getRootPath(version)
    {
        const nw = path.join(home, '.nwjs', nwjs.getName(version).fileName);
        if (!fs.existsSync(nw)) return null;
        return nw;
    },
    /**
     * @param {function(string):boolean=} filter
     * @return {!Promise<?string>}
     */
    getLatestVersion(filter)
    {
        return nwjs.list().then(vers=>{
            if (vers.length === 0) return null;
            if (filter) vers = vers.filter(filter);
            return getFirstOfArray(vers, versionCompare);
        });
    },
    /**
     * @param {function(string):boolean=} filter
     * @return {?string}
     */
    getLatestVersionSync(filter)
    {
        if (!filter) filter = ()=>true;
        var vers = nwjs.listSync();
        if (vers.length === 0) return null;
        if (filter) vers = vers.filter(filter);
        return getFirstOfArray(vers, versionCompare);
    },
    /**
     * @param {string} version
     * @return {?string}
     */
    getNwjc (version) {
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
    getPath (version) {
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
     * @param {string} filename
     * @return {string}
     */
    getVersionFromFileName(filename)
    {
        if (!filename.startsWith('nwjs-')) return '';
        filename = filename.substr(5);
        const endsWith = `-${os.platform}-${os.arch}`;
        if (!filename.endsWith(endsWith)) return '';
        filename = filename.substr(0, filename.length - endsWith.length);
        if (filename.startsWith('sdk-'))
        {
            filename = filename.substr(4);
            if (!filename.startsWith('v')) return '';
            return filename.substr(1)+'-sdk';
        }
        else
        {
            if (!filename.startsWith('v')) return '';
            return filename.substr(1);
        }
    },
    /**
     * @param {string} version
     */
    getName(version)
    {
        var realVersion = version;
        var fileName = "nwjs-";
        if (realVersion.endsWith('-sdk'))
        {
            realVersion = realVersion.substr(0, realVersion.length-4);
            fileName += 'sdk-';
        }
        fileName += `v${realVersion}-${os.platform}-${os.arch}`;
        const ext = os.platform === 'linux' ? 'tar.gz' : 'zip';
        const url = `http://dl.nwjs.io/v${realVersion}/${fileName}.${ext}`;
        return {realVersion, fileName, ext, url};
    },
    /**
     * @param {string} version
     * @return {boolean}
     */
    remove (version) {
        if (!nwjs.exists(version)) return false;
        rm('-r', `${home}/.nwjs/${nwjs.getName(version).fileName}`);
        return true;
    },
    /**
     * @param {function(string):boolean=} filter
     * @return {!Promise<!Array<string>>}
     */
    listAll(filter) {
        return co.wrap(function* () {
            var list = yield getVersions();
            if (filter) list = list.filter(filter);
            return list.sort(versionCompare);
        })();
    },
    /**
     * @param {function(string):boolean=} filter
     * @return {!Promise<!Array<string>>}
     */
    list(filter)
    {
        return co.wrap(function* () {
            var versions = yield pify(fs).readdir(`${home}/.nwjs`).catch(()=>[]);
            versions = versions.map(v=>nwjs.getVersionFromFileName(v)).filter(v=>v);
            if (filter) versions = versions.filter(filter);
            return versions.sort(versionCompare);
        })();
    },
    /**
     * @param {function(string):boolean=} filter
     * @return {!Array<string>}
     */
    listSync(filter)
    {
        var versions = fs.readdirSync(`${home}/.nwjs`);
        versions = versions.map(v=>nwjs.getVersionFromFileName(v)).filter(v=>v);
        if (filter) versions = versions.filter(filter);
        return versions.sort(versionCompare);
    },

    /**
     * @param {string} version
     * @return {!Promise<boolean>}
     */
    install(version)
    {
        return co.wrap(function* ()
        {
            console.log("Download NWjs("+version+")...");
            if (nwjs.exists(version)) return false;

            // Create cache dir
            const cacheDir = path.join(home, '.nwjs');
            try { fs.mkdirSync(cacheDir); } catch(e) {}
            const name = nwjs.getName(version);

            // Download the nwjs
            yield pify(nugget)(name.url, {dir: cacheDir, target: `${version}.${name.ext}`, verbose: true, proxy: process.env.HTTP_PROXY});

            // extract both zip and tarball
            const from = `${cacheDir}/${version}.${name.ext}`;
            if (os.platform === 'linux')
            {
                exec(`tar -xzvf ${from} -C ${cacheDir}`, {silent: true});
            }
            else
            {
                yield pify(extract)(from, {dir: cacheDir});
            }

            // remove zip
            fs.unlinkSync(from);
            
            // print success info
            console.log(`Version ${version} is installed and activated`);
            return true;
        })();
    }
};