/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const Core = require('../node_modules/vscode-chrome-debug-core');
const logger = Core.logger;

const {spawn} = require('child_process');
const DebugProtocol = require('vscode-debugprotocol').DebugProtocol;

const utils = require('./utils');
const fs = require('fs');
const getPath = require('./nwjs/get-path');

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
		const nwjs = getPath();
        if (nwjs === null) throw new Error('Need install! Please use `NWjs Install` command');

        const that = this;

        var linkUrl = '*';
        try
        {
            var obj = JSON.parse(fs.readFileSync(args.webRoot+"/package.json", 'utf-8'));
            if (obj.main) linkUrl = NWJS_URL + obj.main;
        }
        catch(e)
        {
            logger.error(e.stack);
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

            return that.doAttach(port, linkUrl);//, launchUrl, args.address);
        }
        return super.launch(args).then(spawnNWjs);
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
        // This ignore chrome-extention path
        // but nwjs contains local storage as chrome-extension
    }
}

module.exports = ChromeDebugAdapter;
