
import * as fs from 'fs';
import * as path from 'path';

export function eventToPromise(stream:NodeJS.EventEmitter, evname:string):Promise<void>
{
    return new Promise<void>((resolve)=>{
        stream.on(evname, resolve);
    });
}

export function readJson(file:string, def?:Object, forceCreate?:boolean):void
{
    var obj = null;
    try
    {
        obj = JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    catch(e)
    {
        if(!forceCreate) return null;
    }
    if (def)
    {
        var modified = false;
        if (!(obj instanceof Object))
        {
            obj = {};
            modified = true;
        }
        for(const p in def)
        {
            if (p in obj) continue;
            obj[p] = def[p];
            modified = true;
        }
        if (forceCreate && modified) writeJson(file, obj);
    }
    return obj;
}

export function writeJson(file:string, obj:any):void
{
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
}

export function mkdir(dirPath:string):void
{
    try
    {
        return fs.mkdirSync(dirPath);
    }
    catch(error)
    {
        switch(error.code)
        {
        case 'ENOENT':
            mkdir(path.dirname(dirPath));
            return fs.mkdirSync(dirPath);
        case 'EEXIST':
            return;
        }
        throw error;
    }
}

export function writeTo(filename:string, fos:fs.WriteStream):Promise<void>
{
    const read = fs.createReadStream(filename);
    read.pipe(fos, {end: false});
    return eventToPromise(read, 'end');
}

export function copy(from:string, to:string):Promise<void>
{
    const fos = fs.createWriteStream(to);
    fs.createReadStream(from).pipe(fos);
    return eventToPromise(fos, 'close');
}
