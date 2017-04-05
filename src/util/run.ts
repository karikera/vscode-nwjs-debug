const {spawn} = require('child_process');

export default function(cmd:string, args:string[], output:(msg:string)=>void):Promise<string>
{
    return new Promise<string>((resolve)=>{
        const p = spawn(cmd, args);
        p.stdout.on('data', output);
        p.stderr.on('data', output);
        p.on('close', resolve);
    });
};
