'use strict';

/**
 * Module dependencies
 */
import * as os from 'os';

export const arch = os.arch();
export var platform:string;

var platformstr = os.platform();
if (platformstr === 'darwin') {
  platform = 'osx';
} else if (platformstr === 'win32') {
  platform = 'win';
}
