/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
const path = require('path');
global.__base = path.resolve(__dirname, '../..');

const {ChromeDebugSession, logger, UrlPathTransformer, BaseSourceMapTransformer} = require('vscode-chrome-debug-core');

const ChromeDebugAdapter = require('./chromeDebugAdapter');

const EXTENSION_NAME = 'vsc-nwjs';
const targetFilter = (target) => target && (!target.type || target.type === 'page');

// Injected by webpack
const VERSION = require('../../package.json').version;
let versionWithDefault = typeof VERSION === 'undefined' ? 'unspecified' : VERSION; // Not built with webpack for tests

// non-.txt file types can't be uploaded to github
// also note that __dirname here is ...out/
const logFilePath = path.resolve(__dirname, '../vscode-chrome-debug.txt');

// const utils = require('./utils');
// utils.createFunctionListener(ChromeDebugSession.prototype, 'chromeDebugSession');
// utils.createFunctionListener(UrlPathTransformer.prototype, 'pathTransformer');
// utils.createFunctionListener(BaseSourceMapTransformer.prototype, 'sourceMapTransformer');
// utils.createFunctionListener(ChromeDebugAdapter.prototype, 'chromeAdapter');

// Start a ChromeDebugSession configured to only match 'page' targets, which are Chrome tabs.
// Cast because DebugSession is declared twice - in this repo's vscode-debugadapter, and that of -core... TODO
ChromeDebugSession.run(ChromeDebugSession.getSession(
    {
        adapter: ChromeDebugAdapter,
        extensionName: EXTENSION_NAME,
        logFilePath,
        targetFilter,

        pathTransformer: UrlPathTransformer,
        sourceMapTransformer: BaseSourceMapTransformer,
    }));

logger.log(EXTENSION_NAME + ': ' + versionWithDefault);
