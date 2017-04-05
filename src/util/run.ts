import {spawn} from 'child_process';

export function run(cmd:string, args:string[], output:(msg:string)=>void):Promise<string>
{
    return new Promise<string>((resolve)=>{
        const p = spawn(cmd, args);
        p.stdout.on('data', output);
        p.stderr.on('data', output);
        p.on('close', resolve);
    });
};
