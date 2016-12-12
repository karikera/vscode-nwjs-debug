/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const Core = require('../node_modules/vscode-chrome-debug-core');
const logger = Core.logger;
const ISourceMapPathOverrides = Core.ISourceMapPathOverrides;
const coreUtils = Core.utils;

const child_process = require('child_process');
const spawn = child_process.spawn;
const ChildProcess = child_process.ChildProcess;
const DebugProtocol = require('vscode-debugprotocol').DebugProtocol;

const utils = require('./utils');
const path = require('path');
const fs = require('fs');

const PAGE_PAUSE_MESSAGE = 'Paused in Visual Studio Code';
const NWJS_URL = "chrome-extension://fmhmbacajimhohffjheclodmnfkgldjk/";

const DefaultWebSourceMapPathOverrides = {
    //"chrome-extension://fmhmbacajimhohffjheclodmnfkgldjk/*": '${webRoot}/*',
    // 'webpack:///./*': '${webRoot}/*',
    // 'webpack:///*': '*',
    // 'meteor://💻app/*': '${webRoot}/*',
};

function resolveWebRootPattern(webRoot, sourceMapPathOverrides, warnOnMissing)
{
    const resolvedOverrides = {};
    for (let pattern in sourceMapPathOverrides) {
        const replacePattern = sourceMapPathOverrides[pattern];
        resolvedOverrides[pattern] = replacePattern;

        const webRootIndex = replacePattern.indexOf('${webRoot}');
        if (webRootIndex === 0) {
            if (webRoot) {
                resolvedOverrides[pattern] = replacePattern.replace('${webRoot}', webRoot);
            } else if (warnOnMissing) {
                logger.log('Warning: sourceMapPathOverrides entry contains ${webRoot}, but webRoot is not set');
            }
        } else if (webRootIndex > 0) {
            logger.log('Warning: in a sourceMapPathOverrides entry, ${webRoot} is only valid at the beginning of the path');
        }
    }

    return resolvedOverrides;
}

function getSourceMapPathOverrides(webRoot, sourceMapPathOverrides)
{
    return sourceMapPathOverrides ? resolveWebRootPattern(webRoot, sourceMapPathOverrides, /*warnOnMissing=*/true) :
            resolveWebRootPattern(webRoot, DefaultWebSourceMapPathOverrides, /*warnOnMissing=*/false);
}

class ChromeDebugAdapter extends Core.ChromeDebugAdapter
{
    constructor(opt, session)
    {
        super(opt, session);
        this._chromeProc = null;
        this._overlayHelper = null;
    }

    /**
     * @param {DebugProtocol.InitializeRequestArguments} args
     * @return {DebugProtocol.Capabilities}
     */
    initialize(args)
    {
        this._overlayHelper = new utils.DebounceHelper(/*timeoutMs=*/200);
        const capabilities = super.initialize(args);
        capabilities.supportsRestartRequest = true;
        return capabilities;
    }

    /**
     * @return {Promise<void>}
     */
    launch(args)
    {
        const that = this;
        var nwjs = require('nwjs');

        function installTest()
        {
            if (nwjs !== null) return;
            return new Promise((resolve, reject) =>{
                logger.error("Download NWjs(0.14.7-sdk)...");
                const NW_INSTALLER_PATH = path.join(__dirname, '../node_modules/nwjs/nw');
                const installer = child_process.spawn('node', [NW_INSTALLER_PATH,'install','0.14.7-sdk']);
                installer.stdout.on('data', (stdout)=>{ logger.error(stdout); });
                installer.stderr.on('data', (stderr)=>{ logger.error(stderr); });
                installer.on('close', ()=>{
                    nwjs = require('nwjs');
                    if (nwjs === null) reject('Install failed');
                    else resolve();
                });
                installer.on('error', (err) => logger.error(err));
            });
        }
        function spawnNWjs()
        {
            // Start with remote debugging enabled
            const port = args.port || 9222;
            /** @type{string[]} */
            const chromeArgs = ['--remote-debugging-port=' + port];

            // Also start with extra stuff disabled
            if (args.runtimeArgs) {
                chromeArgs.push(...args.runtimeArgs);
            }

            chromeArgs.push(args.webRoot);

            logger.log(`spawn('${nwjs}', ${JSON.stringify(chromeArgs) })`);
            that._chromeProc = spawn(nwjs, chromeArgs, {
                detached: true,
                stdio: ['ignore'],
            });
            that._chromeProc.unref();
            that._chromeProc.on('error', (err) => {
                const errMsg = 'NWJS error: ' + err;
                logger.error(errMsg);
                that.terminateSession(errMsg);
            });

            var linkUrl = '*';
            try
            {
                var obj = JSON.parse(fs.readFileSync(args.webRoot+"/package.json", 'utf-8'));
                if (obj.main) linkUrl = NWJS_URL + obj.main;
            }
            catch(e)
            {
                utils.writeLog(e.stack);
            }
            return that.doAttach(port, linkUrl);//, launchUrl, args.address);
        }

        return super.launch(args)
        .then(installTest)
        .then(spawnNWjs);
    }

    /**
     * @param {ICommonRequestArgs} args
     */
    commonArgs(args)
    {
        args.sourceMapPathOverrides = getSourceMapPathOverrides(args.webRoot, args.sourceMapPathOverrides);
        //args.skipFileRegExps = ['^chrome-extension:.*'];
        super.commonArgs(args);
    }

    /**
     * @param {number} port
     * @param {string=} targetUrl
     * @param {string=} address
     * @param {timeout=} number
     * @return {Promise<void>}
     */
    doAttach(port, targetUrl, address, timeout)
    {
        return super.doAttach(port, targetUrl, address, timeout)
        .then(() => {
            // Don't return this promise, a failure shouldn't fail attach
            this.globalEvaluate({ expression: 'navigator.userAgent', silent: true })
                .then(
                    evalResponse => logger.log('Target userAgent: ' + evalResponse.result.value),
                    err => logger.log('Getting userAgent failed: ' + err.message));
        });
    }

    /**
     *@return {Promise<void>[]}
     */
    runConnection() {
        return [...super.runConnection(), this.chrome.Page.enable()];
    }

    onPaused(notification)
    {
        this._overlayHelper.doAndCancel(() => this.chrome.Page.configureOverlay({ message: ChromeDebugAdapter.PAGE_PAUSE_MESSAGE }).catch(() => { }));
        super.onPaused(notification);
    }

    onResumed()
    {
        this._overlayHelper.wait(() => this.chrome.Page.configureOverlay({ }).catch(() => { }));
        super.onResumed();
    }

    disconnect()
    {
        if (this._chromeProc) {
            this._chromeProc.kill('SIGINT');
            this._chromeProc = null;
        }

        return super.disconnect();
    }

    /**
     * Opt-in event called when the 'reload' button in the debug widget is pressed
     * @return {Promise<void>}
     */
    restart() {
        return this.chrome.Page.reload({ ignoreCache: true });
    }

    shouldIgnoreScript(args)
    {
        return false;
        //return super.shouldIgnoreScript(args);
    }
}

module.exports = ChromeDebugAdapter;
