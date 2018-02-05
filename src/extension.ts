/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as vscode from 'vscode';
const { window } = vscode;
import * as Core from 'vscode-chrome-debug-core';

import {targetFilter} from './utils';

import * as nls from 'vscode-nls';
const localize = nls.config(process.env.VSCODE_NLS_CONFIG)();

import * as fs from 'fs';
import * as path from 'path';
import globby = require('globby');

import * as nwjs from './nwjs/nwjs';
import * as os from './nwjs/os';
import {run} from './util/run';
import * as nfs from './util/nfs';
import * as vs from './util/vs';
import * as util from './util/util';
import { Publisher, ZipPublisher, FilePublisher } from './util/publisher';
import { exec } from './util/exec';

const NEED_INSTALL = 'NEED_INSTALL';
const NEED_PUBLISH_JSON = 'NEED_PUBLISH_JSON';
const NEED_PACKAGE_JSON = 'NEED_PACKAGE_JSON';

const DEFAULT_PACKAGE_JSON = {
    name: 'untitled',
    main: 'index.html'
};
const DEFAULT_PUBLISH_JSON = {
    "version":'any',
	"package":{},
	"html":["index.html"],
	"files":[],
	"exclude": []
};

var onProgress = false;
var selectedFile = '';
var selectedDir = '';

function replaceExt(filename:string, ext:string):string
{
    const extidx = filename.lastIndexOf('.');
    if (Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) < extidx)
        return filename.substr(0,extidx) + '.'+ext;
    else
        return filename + '.'+ext;
}

async function installNWjs(version?:nwjs.VersionInfo):Promise<void>
{
    if (!version)
    {
        version = await window.showQuickPick(
            nwjs.listAll().then(async(list)=>{
                const have = await nwjs.list();
                const haveset = new Set<string>();
                for(const info of have)
                {
                    haveset.add(info.versionText);
                }
                
                for (const info of list)
                {
                    if (haveset.has(info.versionText))
                    {
                        info.description += ' (Installed)';
                    }
                }
                return list;
            }), 
            {placeHolder: "Select install version"});
        if (!version) return;
    }
    var downloaded = false;
    downloaded = (await version.install()) || downloaded;
    downloaded = (await version.getSdkVersion().install()) || downloaded;
    vs.clear();
    if(downloaded) vs.infoBox("Install complete");
    else vs.infoBox("NWjs already installed");
}

async function removeNWjs():Promise<void>
{
    const version = await window.showQuickPick(
        nwjs.list(v=>!v.sdk),
        {placeHolder: "Select remove version"});
    if (!version) return;
    var res = false;
    res = (await version.remove()) || res;
    res = (await version.getSdkVersion().remove()) || res;
    if (res) vs.infoBox("Remove complete");
    else vs.infoBox("NWjs already removed");
}

async function compileNWjs(version?:nwjs.VersionInfo, filename?:string, outputFile?:string):Promise<void>
{
    if (!version)
    {
        var versions = await nwjs.list();
        versions = versions.filter(v=>!v.sdk);
        if (versions.length !== 1)
            version = await window.showQuickPick(versions, {placeHolder: "Select compiler version"});
        else
            version = versions[0];
        if (!version) return;
    }

    if (!filename) filename = selectedFile;
    if (!outputFile) outputFile = replaceExt(filename, '.bin');

    const path = await version.getSdkVersion().getNwjc();
    if (path === null) throw new Error(NEED_INSTALL+'#'+version.versionText);
    await run(path, [filename, outputFile], str=>vs.log(str));
}

async function copyNWjs(outdir:string, version:nwjs.VersionInfo, exclude:string[]):Promise<void>
{
    const excludeMap:{[key:string]:boolean} = {};
    for(const ex of exclude)
        excludeMap[ex] = true;

    const srcdir = await version.getRootPath();
    if (srcdir === null) throw Error('Installed NWjs not found');
    for(const src of await globby([srcdir+'/**']))
    {
        const name = src.substr(srcdir.length+1);
        if (name in excludeMap) continue;
        const dest = path.join(outdir, name);
        const stat = await nfs.stat(src);
        if (stat.isDirectory())
        {
            try
            {
                await nfs.mkdir(dest);
            }
            catch(e){}
        }
        else
        {
            await nfs.copy(src, dest);
        }
    }
}

async function publishNWjsExe(outdir:string, version:nwjs.VersionInfo, nwfile:string, packageJson:{name:string}):Promise<void>
{
    if(os.platform === 'osx')
    {
        // Contents/Resources/nw.icns: icon of your app.
        // Contents/Info.plist: the apple package description file.
        await nfs.copy(nwfile, path.join(outdir, 'nwjs.app/Contents/Resources/app.nw'));
    }
    else
    {
        const nwjsPath = await version.getPath();
        if (nwjsPath === null) throw Error('Installed NWjs not found');
        const exepath = path.join(outdir, packageJson.name+'.exe');
        const fos = fs.createWriteStream(exepath);
        await nfs.writeTo(nwjsPath, fos);
        await nfs.writeTo(nwfile, fos);
        fos.end();
    }
}

async function publishNWjs():Promise<void>
{
    const config = await nfs.readJson('nwjs.publish.json', DEFAULT_PUBLISH_JSON);
    if (!config) throw new Error(NEED_PUBLISH_JSON);
    const exclude = resolveToStringArray(config.exclude);
    const files = resolveToStringArray(config.files);
    const html = resolveToStringArray(config.html);
    var version:nwjs.VersionInfo;
    
    {
        const versionText = resolveToString(config.nwjsVersion);
        if (!versionText || versionText === 'any')
        {
            version = await nwjs.getLatestVersion();
            if (!version) throw new Error(NEED_INSTALL);
        }
        else
        {
            version = nwjs.VersionInfo.fromVersionText(versionText);
        }
    }

    const nwjsPath = await version.getPath();
    if (nwjsPath === null) throw new Error(NEED_INSTALL+'#'+version.versionText);

    const targets = {};
    const bindir = 'bin';
    const publishdir = 'publish';
    const packagejson = await nfs.readJson('package.json', DEFAULT_PACKAGE_JSON);
    if (!packagejson) throw new Error(NEED_PACKAGE_JSON);

    util.override(packagejson, config.package);

    await nfs.mkdir(bindir);
    await nfs.mkdir(publishdir);
    const zippath = path.join(bindir, packagejson.name+'.zip');
    
    var publisher:Publisher;
    if (config.zip)
    {
        publisher = new ZipPublisher(zippath);
    }
    else
    {
        publisher = new FilePublisher(publishdir);
    }
    await publisher.text('package.json', JSON.stringify(packagejson));

    vs.show();

    if (config.postPublish)
    {
        vs.log('Run prePublish...');
        await exec(config.prePublish, vs.log, vs.log);
    }

    vs.log('Convert html...');
    for(const src of await globby(html))
    {
        vs.log(src);
        const script = await nfs.readFile(src);
        await publisher.text(src, replaceScriptTag(script, targets));
    }

    vs.log('Compile js...');
    for(const src in targets)
    {
        vs.log(src);
        const binfilename = targets[src];
        const dest = path.join(bindir, binfilename);
        await nfs.mkdir(path.dirname(dest));
        await compileNWjs(version, src, dest);
        await publisher.file(binfilename, dest);
    }

    vs.log('Copy files...');
    for(const src of await globby(files))
    {
        if (fs.statSync(src).isDirectory()) continue;
        vs.log(src);
        await publisher.file(src);
    }

    await publisher.finalize();

    vs.log('Generate exe...');
    if (config.zip)
    {
        exclude.push('nw.exe');
        await copyNWjs(publishdir, version, exclude);
        await publishNWjsExe(publishdir, version, zippath, packagejson);
    }
    else
    {
        await copyNWjs(publishdir, version, exclude);
    }
    if (config.postPublish)
    {
        vs.log('Run postPublish...');
        await exec(config.postPublish, vs.log, vs.log);
    }
    vs.log('Complete');
}

async function generatePublishJson():Promise<void>
{
    await nfs.writeJson('nwjs.publish.json', DEFAULT_PUBLISH_JSON);
    vs.open(path.resolve('nwjs.publish.json'));
}

async function generatePackageJson():Promise<void>
{
    await nfs.writeJson('package.json', DEFAULT_PACKAGE_JSON);
    vs.open(path.resolve('package.json'));
}

function oncatch(err:Error):Thenable<void>
{
    if (!err)
    {
        vs.log(err.stack);
        vs.errorBox(err+'');
        return;
    }
    const errobj = <any>err;
    if (errobj._value)
    {
        err = errobj._value;
    }

    if (!err.message)
    {
        vs.log(err.stack);
        try
        {
            vs.errorBox(JSON.stringify(err));
        }
        catch(e)
        {
            vs.errorBox(err+'');
        }
        return;
    }
    const errarray = err.message.split('#', 2);
    const [msg, param] = err.message.split('#', 2);
    switch(msg)
    {
    case NEED_INSTALL:
        return vs.errorBox('Need install NWjs!', 'Install')
        .then((select)=>{
            if (!select) return;
            return installNWjs(nwjs.VersionInfo.fromVersionText(param)).catch(oncatch);
        });
    case NEED_PUBLISH_JSON:
        return vs.errorBox('Need nwjs.publish.json!', 'Generate')
        .then((select)=>{
            if (!select) return;
            return generatePublishJson().catch(oncatch);
        });
    case NEED_PACKAGE_JSON:
        return vs.errorBox('Need package.json!', 'Generate')
        .then((select)=>{
            if (!select) return;
            return generatePackageJson().catch(oncatch);
        });
    default:
        vs.log(err.stack);
        vs.errorBox(err.stack);
        break;
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('vscode-nwjs.toggleSkippingFile', toggleSkippingFile));

    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('chrome', new ChromeConfigurationProvider()));
    
    console.log('[extension: vscode-nwjs] activate');
    function regist(command:string, oncommand:()=>Promise<void>):void
    {
        const disposable = vscode.commands.registerCommand(command, ()=>{
            try
            {
                if (onProgress)
                {
                    vs.show();
                    return;
                }
                onProgress = true;
                vs.clear();
                vs.show();
                const stdout = process.stdout.write;
                const stderr = process.stderr.write;
                const channelStream = new vs.ChannelStream();
                process.stderr.write = process.stdout.write = channelStream.bindWrite();
                var olddir = '';
                if (window.activeTextEditor)
                {
                    selectedFile = window.activeTextEditor.document.fileName;
                    selectedDir = path.dirname(selectedFile);
                    olddir = process.cwd();
                    process.chdir(selectedDir);
                }
                else
                {
                    selectedFile = '';
                    selectedDir = '';
                }
                Promise.resolve()
                .then(()=>oncommand())
                .catch(oncatch)
                .then(()=>{
                    if(olddir) process.chdir(olddir);
                    channelStream.end();
                    process.stdout.write = stdout;
                    process.stderr.write = stderr;
                    onProgress = false;
                });
            }
            catch(err)
            {
                vs.log(err.stack);
                vs.errorBox(err.error);
            }
        });
        context.subscriptions.push(disposable);
    }

    regist('vscode-nwjs.install', installNWjs);
    regist('vscode-nwjs.remove', removeNWjs);
    regist('vscode-nwjs.publish', publishNWjs);
    regist('vscode-nwjs.compile', compileNWjs);
}

export function deactivate() {
    console.log('[extension: vscode-nwjs] deactivate');
}

const DEFAULT_CONFIG = {
    type: 'chrome',
    request: 'launch',
    name: localize('chrome.launch.name', "Launch Chrome against localhost"),
    url: 'http://localhost:8080',
    webRoot: '${workspaceFolder}'
};

export class ChromeConfigurationProvider implements vscode.DebugConfigurationProvider {
    provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration[]> {
        return Promise.resolve([DEFAULT_CONFIG]);
    }

	/**
	 * Try to add all missing attributes to the debug configuration being launched.
	 */
    async resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
        // if launch.json is missing or empty
        if (!config.type && !config.request && !config.name) {
            // Return null so it will create a launch.json and fall back on provideDebugConfigurations - better to point the user towards the config
            // than try to work automagically.
            return null;
        }

        if (config.request === 'attach') {
            const discovery = new Core.chromeTargetDiscoveryStrategy.ChromeTargetDiscovery(
                new Core.NullLogger(), new Core.telemetry.NullTelemetryReporter());

            let targets;
            try {
                targets = await discovery.getAllTargets(config.address || '127.0.0.1', config.port, targetFilter, config.url);
            } catch (e) {
                // Target not running?
            }

            if (targets && targets.length > 1) {
                const selectedTarget = await pickTarget(targets);
                if (!selectedTarget) {
                    // Quickpick canceled, bail
                    return null;
                }

                config.websocketUrl = selectedTarget.websocketDebuggerUrl;
            }
        }

        return config;
    }
}

function toggleSkippingFile(path: string): void {
    if (!path) {
        const activeEditor = vscode.window.activeTextEditor;
        path = activeEditor && activeEditor.document.fileName;
    }

    if (path && vscode.debug.activeDebugSession) {
        const args: Core.IToggleSkipFileStatusArgs = typeof path === 'string' ? { path } : { sourceReference: path };
        vscode.debug.activeDebugSession.customRequest('toggleSkipFileStatus', args);
    }
}

interface ITargetQuickPickItem extends vscode.QuickPickItem {
    websocketDebuggerUrl: string;
}

async function pickTarget(targets: Core.chromeConnection.ITarget[]): Promise<ITargetQuickPickItem> {
    const items = targets.map(target => (<ITargetQuickPickItem>{
        label: unescapeTargetTitle(target.title),
        detail: target.url,
        websocketDebuggerUrl: target.webSocketDebuggerUrl
    }));

    const placeHolder = localize('chrome.targets.placeholder', "Select a tab");
    const selected = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true, matchOnDetail: true });
    return selected;
}

function unescapeTargetTitle(title: string): string {
    return title
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, `'`)
        .replace(/&quot;/g, '"');
}

function replaceScriptTag(html:string, compileTargets:Object):string
{
    const regexp = /<script([ \t]+[^>]+)?>/g;
    const prop = /[ \t]+src=(["'])([^"']+)\1/;
    var out = '';
    var previous = 0;
    for(;;)
    {
        const res = regexp.exec(html);
        if (!res) break;
        const propres = prop.exec(res[1]);
        const end = html.indexOf("</script>", regexp.lastIndex);
        if (propres && propres[2])
        {
            const src = propres[2];
            out += html.substring(previous, res.index);
            const output = replaceExt(src,'bin');
            out += `<script>require('nw.gui').Window.get().evalNWBin(null, '${output}');</script>`;
            previous = end+9;
            compileTargets[src] = output;
        }
        regexp.lastIndex = end + 9;
    }
    out += html.substr(previous);
    return out;
}

function resolveToString(value:any):string
{
    if (value) return value + '';
    return '';
}

function resolveToStringArray(value:any):string[]
{
    if (!(value instanceof Array)) return [];
    return value.map(resolveToString);
}
