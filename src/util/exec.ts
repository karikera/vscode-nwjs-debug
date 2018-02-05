
import * as cp from 'child_process';
import spawncmd = require('spawn-command');

export function exec(command:string, stdout:(data:string)=>void, stderr:(data:string)=>void):Promise<number>
{
    return new Promise((resolve, reject)=>{
        const spawn = spawncmd(command);
        spawn.stdout.on('data', stdout);
        spawn.stderr.on('data', stderr);
        spawn.on('error', reject);
		spawn.on('close', (code, signal) => resolve(code));
    });
}