/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const {ChromeDebugAdapter: CoreDebugAdapter, logger, utils: coreUtils} = require('vscode-chrome-debug-core');
const {spawn} = require('child_process');

const utils = require('./utils');
const nfs = require('../nfs');
const nwjs = require('../nwjs/nwjs');

const DefaultWebSourceMapPathOverrides = {
    'webpack:///./*': '${webRoot}/*',
    'webpack:///*': '*',
    'meteor://💻app/*': '${webRoot}/*',
};
const DEFAULT_PACKAGE_JSON = {
    name: 'untitled',
    main: 'index.html'
};

class ChromeDebugAdapter extends CoreDebugAdapter {
	static get PAGE_PAUSE_MESSAGE() { return 'Paused in Visual Studio Code'; }

    constructor(opt, session) {
        super(opt, session);
        this._chromeProc = null;
        this._overlayHelper = null;
    }

    initialize(args) {
        this._overlayHelper = new utils.DebounceHelper(/*timeoutMs=*/200);
        const capabilities = super.initialize(args);
        capabilities.supportsRestartRequest = true;

        return capabilities;
    }

    launch(args) {
        const that = this;
        return super.launch(args).then(() => {
            // Check exists?
            var chromePath = args.runtimeExecutable;
            if (!chromePath)
            {
                const version = args.nwjsVersion;
                if (version && version !== 'any')
                {
                    chromePath = nwjs.getPath(version + '-sdk');
                    if (!chromePath) 
                    {
                        return coreUtils.errP(`Need to install NWjs ${version}! - Please use "NWjs Install" command.`);
                    }
                }
                else
                {
                    chromePath = nwjs.getPath(nwjs.getLatestVersionSync(v=>v.endsWith('-sdk')));
                    if (!chromePath) 
                    {
                        return coreUtils.errP(`Need to install NWjs! - Please use "NWjs Install" command.`);
                    }
                }
            }

            // Start with remote debugging enabled
            const port = args.port || 9222;
            const chromeArgs = [];

            if (!args.noDebug) {
                chromeArgs.push('--remote-debugging-port=' + port);
            }

            if (args.runtimeArgs) {
                chromeArgs.push(...args.runtimeArgs);
            }


	        const config = nfs.readJson(args.webRoot+"/package.json", DEFAULT_PACKAGE_JSON, true);
	        const launchUrl = 'chrome-extension://*/' + config.main;

            chromeArgs.push('.');

            logger.log(`spawn('${chromePath}', ${JSON.stringify(chromeArgs) })`);
            that._chromeProc = spawn(chromePath, chromeArgs, {
                detached: true,
                stdio: ['ignore'],
                cwd: args.webRoot,
            });
            that._chromeProc.unref();
            that._chromeProc.on('error', (err) => {
                const errMsg = 'NWJS error: ' + err;
                logger.error(errMsg);
                that.terminateSession(errMsg);
            });

            return args.noDebug ? undefined :
                this.doAttach(port, launchUrl); // , args.address);
        });
    }

    attach(args) {
        return super.attach(args);
    }

    commonArgs(args) {
        if (!args.webRoot && args.pathMapping && args.pathMapping['/']) {
            // Adapt pathMapping['/'] as the webRoot when not set, since webRoot is explicitly used in many places
            args.webRoot = args.pathMapping['/'];
        }

        args.sourceMaps = typeof args.sourceMaps === 'undefined' || args.sourceMaps;
        args.sourceMapPathOverrides = getSourceMapPathOverrides(args.webRoot, args.sourceMapPathOverrides);
        //args.skipFileRegExps = ['^chrome-extension:.*'];

        super.commonArgs(args);
    }

    doAttach(port, targetUrl, address, timeout) {
        return super.doAttach(port, targetUrl, address, timeout).then(() => {
            // Don't return this promise, a failure shouldn't fail attach
            this.globalEvaluate({ expression: 'navigator.userAgent', silent: true })
                .then(
                    evalResponse => logger.log('Target userAgent: ' + evalResponse.result.value),
                    err => logger.log('Getting userAgent failed: ' + err.message));
        });
    }

    runConnection() {
        return [...super.runConnection(), this.chrome.Page.enable()];
    }

    onPaused(notification, expectingStopReason) {
        this._overlayHelper.doAndCancel(() => this.chrome.Page.configureOverlay({ message: ChromeDebugAdapter.PAGE_PAUSE_MESSAGE }).catch(() => { }));
        super.onPaused(notification, expectingStopReason);
    }

    onResumed() {
        this._overlayHelper.wait(() => this.chrome.Page.configureOverlay({ }).catch(() => { }));
        super.onResumed();
    }

    disconnect() {
        if (this._chromeProc) {
            this._chromeProc.kill('SIGINT');
            this._chromeProc = null;
        }

        return super.disconnect();
    }

    /**
     * Opt-in event called when the 'reload' button in the debug widget is pressed
     */
    restart() {
        return this.chrome.Page.reload({ ignoreCache: true });
    }

    shouldIgnoreScript(args) {
        return false;
        //return super.shouldIgnoreScript(args);
        // This ignore chrome-extention path
        // but nwjs contains local storage as chrome-extension
    }
}

function getSourceMapPathOverrides(webRoot, sourceMapPathOverrides){
    return sourceMapPathOverrides ? resolveWebRootPattern(webRoot, sourceMapPathOverrides, /*warnOnMissing=*/true) :
            resolveWebRootPattern(webRoot, DefaultWebSourceMapPathOverrides, /*warnOnMissing=*/false);
}

/**
 * Returns a copy of sourceMapPathOverrides with the ${webRoot} pattern resolved in all entries.
 */
function resolveWebRootPattern(webRoot, sourceMapPathOverrides, warnOnMissing) {
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


module.exports = ChromeDebugAdapter;
