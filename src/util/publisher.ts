
import archiver = require('archiver');
import * as fs from 'fs';
import * as nfs from './nfs';
import * as vs from './vs';
import * as path from 'path';


export abstract class Publisher
{
    abstract text(filename:string, text:string):Promise<void>;
    abstract file(filename:string, from?:string):Promise<void>;

    finalize():Promise<void>
    {
        return Promise.resolve();
    }
    
}


export class ZipPublisher extends Publisher
{
    private readonly archive = archiver('zip', {store: true});
    private readonly zipfos:fs.WriteStream;

    constructor(zippath:string)
    {
        super();
        
        this.zipfos = fs.createWriteStream(zippath);
        this.archive.pipe(this.zipfos);
    }

    async text(filename:string, text:string):Promise<void>
    {
        this.archive.append(text, { name: filename });
    }
    async file(filename:string, from?:string):Promise<void>
    {
        if (from === undefined) from = filename;
        (<any>this.archive).file(from, { name: filename });
    }

    finalize():Promise<void>
    {
        vs.log('Flush zip...');
        this.archive.finalize();
        return new Promise<void>((resolve, reject)=>{
            this.zipfos.on('close', resolve);
            this.zipfos.on('error', reject);
        });
    }
}

export class FilePublisher extends Publisher
{
    constructor(private publishdir:string)
    {
        super();
    }

    async text(filename:string, text:string):Promise<void>
    {
        filename = path.join(this.publishdir, filename);
        await nfs.mkdir(path.dirname(filename));
        await nfs.writeFile(filename, text);
    }
    async file(filename:string, from?:string):Promise<void>
    {
        if (from === undefined) from = filename;
        filename = path.join(this.publishdir, filename);
        await nfs.mkdir(path.dirname(filename));
        await nfs.copy(from, filename);
    }
}
