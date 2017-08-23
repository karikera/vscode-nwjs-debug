'use strict';

/**
 * Module dependencies
 */
import * as os from 'os';

function getArch():string
{
    const platformstr = os.platform();
    switch (platformstr)
    {
    case 'darwin': return 'osx';
    case 'win32': return 'win';
    default: return platformstr;
    }    
}

export const arch = os.arch();
export const platform:string = getArch();
export const supportArch:Set<string> = new Set;

if (arch === 'x64' && (platform === 'win' || platform === 'linux'))
{
    supportArch.add('ia32');
}
supportArch.add(arch);

