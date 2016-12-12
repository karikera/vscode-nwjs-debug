/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

var path = require('path');
var utils = require('./utils');
global.__base = path.resolve(__dirname, '..');

var Core = require('../node_modules/vscode-chrome-debug-core');

var ChromeDebugSession = Core.ChromeDebugSession;
var logger = Core.logger;
var UrlPathTransformer = Core.UrlPathTransformer;
var BaseSourceMapTransformer = Core.BaseSourceMapTransformer;

var ChromeDebugAdapter = require('./chromeDebugAdapter');

const EXTENSION_NAME = 'nwjs';
const targetFilter = (target) => target && (!target.type || target.type === 'page');

// non-.txt file types can't be uploaded to github
// also note that __dirname here is ...out/
const logFilePath = path.resolve(__dirname, '../vscode-chrome-debug.txt');

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
