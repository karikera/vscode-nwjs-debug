'use strict';

/**
 * Module dependencies
 */
const home:string = require('user-home');
import {exec} from 'shelljs';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as fs from 'fs';
import * as nfs from '../util/nfs';
const getVersions:()=>Promise<string[]> = require('nwjs-versions');
const nugget = require('nugget');
const extract = require('extract-zip');
const pify = require('pify');
import * as os from './os';

const PLATFORM_LEVELS = {
    'ia32':1,
    'x64':2,
};


export class VersionInfo
{
    public version:string = '';
    public sdk:boolean = false;
    public platform:string = '';
    public arch:string = '';

    // resetable values
    public versionText:string = '';

    public versions:number[] = null;
    public exver:string = '';

    public ext:string = '';

    public label:string = '';
    public description:string = '';
    public detail:string = '';

    public getRootPathSync():string|null
    {
        const nw = path.join(home, '.nwjs', this.getFileName());
        if (!fs.existsSync(nw)) return null;
        return nw;
    }

    public async getRootPath():Promise<string|null>
    {
        const nw = path.join(home, '.nwjs', this.getFileName());
        if (!await nfs.exists(nw)) return null;
        return nw;
    }

    public getNwjcSync():string|null
    {
        const root = this.getRootPathSync();
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
    
    public async getNwjc():Promise<string|null>
    {
        const root = await this.getRootPath();
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
    
    public getPathSync():string|null
    {
        const root = this.getRootPathSync();
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
    
    public async getPath():Promise<string|null>
    {
        const root = await this.getRootPath();
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

    public existsSync():boolean
    {
        return this.getRootPathSync() !== null;
    }
    
    public async exists():Promise<boolean>
    {
        return (await this.getRootPathSync()) !== null;
    }

    public getUrl():string
    {
        return `http://dl.nwjs.io/v${this.version}/${this.getFileName()}.${this.ext}`;
    }

    public getSdkVersion():VersionInfo
    {
        const sdkv = new VersionInfo;
        sdkv.version = this.version;
        sdkv.sdk = true;
        sdkv.platform = this.platform;
        sdkv.arch = this.arch;
        sdkv.update();
        return sdkv;
    }

    public isAvailable():boolean
    {
        if (this.platform !== os.platform) return false;
        return os.supportArch.has(this.arch);
    }
    
    public async install():Promise<boolean>
    {
        console.log("Download NWjs("+this.versionText+")...");
        if (await this.exists()) return false;

        // Create cache dir
        const cacheDir = path.join(home, '.nwjs');
        try { fs.mkdirSync(cacheDir); } catch(e) {}

        // Download the nwjs
        await pify(nugget)(this.getUrl(), {dir: cacheDir, target: `${this.versionText}.${this.ext}`, verbose: true, proxy: process.env.HTTP_PROXY});

        // extract both zip and tarball
        const from = `${cacheDir}/${this.versionText}.${this.ext}`;
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
        console.log(`Version ${this.versionText} is installed and activated`);
        return true;
    }

    public async remove():Promise<boolean>
    {
        if (!await this.exists()) return false;
        await fse.remove(`${home}/.nwjs/${this.getFileName()}`);
        return true;
    }

    public getFileName():string
    {
        var fileName = "nwjs-";
        if (this.sdk) fileName += 'sdk-';
        fileName += `v${this.version}-${this.platform}-${this.arch}`;
        return fileName;
    }

    public update():void
    {
        this.ext = this.platform === 'linux' ? 'tar.gz' : 'zip';
        
        var vread = this.version;
        const exver_idx = vread.indexOf('-');
        if (exver_idx !== -1)
        {
            this.exver = vread.substr(exver_idx+1);
            vread = vread.substr(0, exver_idx);
        }
        this.versions = vread.split('.').map(v=>+v);
        
        var versionText = this.version;
        if (this.sdk) versionText += '-sdk';

        if (this.platform !== os.platform)
        {
            versionText += `(${this.platform}-${this.arch})`;
        }
        else if (os.supportArch.size !== 1)
        {
            versionText += `(${this.arch})`;
        }

        this.versionText = versionText;
        this.label = this.version;
        this.description = this.platform + '-' + this.arch;
    }

    public static fromVersionText(version:string):VersionInfo
    {
        var platform = os.platform;
        var arch = os.arch;
    
        const platformIdx = version.lastIndexOf('(');
        if (platformIdx !== -1)
        {
            const platformIdxEnd = version.lastIndexOf(')');
            const paltform_arch = version.substring(platformIdx + 1, platformIdxEnd);
            var [platform, arch] = paltform_arch.split('-');
            if (!arch)
            {
                arch = platform;
                platform = os.platform;
            }
            version = version.substr(0, platformIdx);
        }
    
        const info = new VersionInfo;
        if (version.endsWith('-sdk'))
        {
            version = version.substr(0, version.length-4);
            info.sdk = true;
        }
        
        info.platform = platform;
        info.arch = arch;
        info.version = version;
        info.update();
        return info;
    }

    public static fromFileName(filename:string):VersionInfo
    {
        if (!filename.startsWith('nwjs-')) return null;
        filename = filename.substr(5);
    
        var isSdk = false;
        if (filename.startsWith('sdk-'))
        {
            filename = filename.substr(4);
            isSdk = true;
        }
        if (!filename.startsWith('v')) return null;
        filename = filename.substr(1);
    
        function readTail():string
        {
            const idx = filename.lastIndexOf('-');
            if (idx === -1) return '';
            const tail = filename.substr(idx+1);
            filename = filename.substr(0, idx);
            return tail;
        }
    
        const arch = readTail();
        const platform = readTail();
    
        const info = new VersionInfo;
        info.sdk = isSdk;
        info.platform = platform;
        info.arch = arch;
        info.version = filename;
        info.update();
        return info;
    }

    toString():string
    {
        return this.versionText;
    }
}

function archCompare(a:string, b:string):number
{
    var alv = PLATFORM_LEVELS[a] || 3;
    var blv = PLATFORM_LEVELS[b] || 3;
    return alv - blv;
}

function versionCompare(a:VersionInfo, b:VersionInfo):number
{
    const count = Math.min(a.versions.length, b.versions.length);
    for(var i=0;i<count;i++)
    {
        const delta = b.versions[i] - a.versions[i];
        if (delta !== 0) return delta;
    }
    return (b.versions.length - a.versions.length) ||
        (+a.sdk - +b.sdk) || 
        b.ext.localeCompare(a.ext) || 
        b.platform.localeCompare(a.platform) ||
        archCompare(b.arch, a.arch);
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

export function getLatestVersion(filter?:(ver:VersionInfo)=>boolean):Promise<VersionInfo>
{
    if (!filter) filter = ()=>true;
    return list(ver=>ver.isAvailable() && filter(ver)).then(vers=>{
        if (vers.length === 0) return null;
        return vers[0];
    });
}

export function getLatestVersionSync(filter:(ver:VersionInfo)=>boolean):VersionInfo
{
    if (!filter) filter = ()=>true;
    var vers = listSync(ver=>ver.isAvailable() && filter(ver));
    if (vers.length === 0) return null;
    return vers[0];
}

export async function listAll(filter?:(ver:VersionInfo)=>boolean|void):Promise<VersionInfo[]>
{
    const supportArchs = [... os.supportArch];
 
    var list:string[] = await getVersions();   
    list = list.reduce((a,b)=>{
        for (const arch of supportArchs)
        {
            a.push(`${b}(${arch})`);
        }
        return a;
    }, []);

    var verisonList:VersionInfo[] = list.map(v=>VersionInfo.fromVersionText(v));
    if (filter) verisonList = verisonList.filter(filter);
    return verisonList.sort(versionCompare);
}

export async function list(filter?:(ver:VersionInfo)=>boolean):Promise<VersionInfo[]>
{
    var versions = await pify(fs).readdir(`${home}/.nwjs`).catch(()=>[]);
    var infos = versions.map(v=>VersionInfo.fromFileName(v)).filter(v=>v);
    if (filter) infos = infos.filter(filter);
    return infos.sort(versionCompare);
}

export function listSync(filter?:(ver:VersionInfo)=>boolean):VersionInfo[]
{
    var versions = fs.readdirSync(`${home}/.nwjs`);
    var infos = versions.map(v=>VersionInfo.fromFileName(v)).filter(v=>v);
    if (filter) infos = infos.filter(filter);
    return infos.sort(versionCompare);
}
