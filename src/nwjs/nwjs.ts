'use strict';

/**
 * Module dependencies
 */
const home:string = require('user-home');
import {rm, exec} from 'shelljs';
import * as path from 'path';
import * as fs from 'fs';
const getVersions:()=>Promise<string[]> = require('nwjs-versions');
const nugget = require('nugget');
const extract = require('extract-zip');
const pify = require('pify');
import * as os from './os';

function splitVersionInfo(vstr:string):{version:number[], ext:string}
{
    const extidx = vstr.indexOf('-');
    var ext = '';
    if (extidx !== -1)
    {
        ext = vstr.substr(extidx+1);
        vstr = vstr.substr(0, extidx);
    }
    const version = vstr.split('.').map(v=>+v);
    return {version, ext};
}

function versionCompare(a:string, b:string):number
{
    const ares = splitVersionInfo(a);
    const bres = splitVersionInfo(b);
    const count = Math.min(ares.version.length, bres.version.length);
    for(var i=0;i<count;i++)
    {
        const delta = bres.version[i] - ares.version[i];
        if (delta !== 0) return delta;
    }
    const delta = bres.version.length - ares.version.length;
    if (delta !== 0) return delta;
    return bres.ext.localeCompare(ares.ext);
}

function getFirstOfArray<T>(array:T[], cmp:(v1:T,v2:T)=>number):T|undefined
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

export function exists(version:string):boolean
{
    return getRootPath(version) !== null;
}

export function getRootPath(version:string):string|null
{
    const nw = path.join(home, '.nwjs', getName(version).fileName);
    if (!fs.existsSync(nw)) return null;
    return nw;
}

export function getLatestVersion(filter?:(ver:string)=>boolean):Promise<string|null>
{
    return list(filter).then(vers=>{
        if (vers.length === 0) return null;
        return vers[0];
    });
}

export function getLatestVersionSync(filter:(ver:string)=>boolean):string|null
{
    if (!filter) filter = ()=>true;
    var vers = listSync(filter);
    if (vers.length === 0) return null;
    return vers[0];
}

export function getNwjc(version:string):string|null
{
    const root = getRootPath(version);
    if (root === null) return null;

    let nw;
    switch(os.platform)
    {
    case 'osx': nw = 'nwjc'; break;
    case 'win': nw = 'nwjc.exe'; break;
    default: nw = 'nwjc'; break;
    }
    return path.join(root, nw);
}

export function getPath (version:string):string|null
{
    const root = getRootPath(version);
    if (root === null) return null;

    let nw;
    switch(os.platform)
    {
    case 'osx': nw = 'nwjs.app/Contents/MacOS/nwjs'; break;
    case 'win': nw = 'nw.exe'; break;
    default: nw = 'nw'; break;
    }
    return path.join(root, nw);
}

export function getVersionFromFileName(filename:string):string
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
}

export function getName(version:string):{realVersion:string, fileName:string, ext:string, url:string}
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
}

export function remove (version:string):boolean
{
    if (!exists(version)) return false;
    rm('-r', `${home}/.nwjs/${getName(version).fileName}`);
    return true;
}

export async function listAll(filter:(ver:string)=>boolean|void):Promise<string[]>
{
    var list = await getVersions();
    if (filter) list = list.filter(filter);
    return list.sort(versionCompare);
}

export async function list(filter?:(ver:string)=>boolean):Promise<string[]>
{
    var versions = await pify(fs).readdir(`${home}/.nwjs`).catch(()=>[]);
    versions = versions.map(v=>getVersionFromFileName(v)).filter(v=>v);
    if (filter) versions = versions.filter(filter);
    return versions.sort(versionCompare);
}

export function listSync(filter?:(ver:string)=>boolean):string[]
{
    var versions = fs.readdirSync(`${home}/.nwjs`);
    versions = versions.map(v=>getVersionFromFileName(v)).filter(v=>v);
    if (filter) versions = versions.filter(filter);
    return versions.sort(versionCompare);
}

export async function install(version:string):Promise<boolean>
{
    console.log("Download NWjs("+version+")...");
    if (exists(version)) return false;

    // Create cache dir
    const cacheDir = path.join(home, '.nwjs');
    try { fs.mkdirSync(cacheDir); } catch(e) {}
    const name = getName(version);

    // Download the nwjs
    await pify(nugget)(name.url, {dir: cacheDir, target: `${version}.${name.ext}`, verbose: true, proxy: process.env.HTTP_PROXY});

    // extract both zip and tarball
    const from = `${cacheDir}/${version}.${name.ext}`;
    if (os.platform === 'linux')
    {
        exec(`tar -xzvf ${from} -C ${cacheDir}`, {silent: true});
    }
    else
    {
        await pify(extract)(from, {dir: cacheDir});
    }

    // remove zip
    fs.unlinkSync(from);
    
    // print success info
    console.log(`Version ${version} is installed and activated`);
    return true;
}
