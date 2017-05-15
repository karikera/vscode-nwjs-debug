'use strict';

/**
 * Module dependencies
 */
import * as os from 'os';

export const arch = os.arch();
export var platform:string;

var platformstr = os.platform();
switch (platformstr)
{
case 'darwin': platform = 'osx'; break;
case 'win32': platform = 'win'; break;
default: platform = platformstr; break;
}
