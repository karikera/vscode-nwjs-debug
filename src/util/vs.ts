
import {window, workspace, TextEditor} from 'vscode';
import * as stream from 'stream';

const output = window.createOutputChannel("NWjs");

export class ChannelStream extends stream.Writable
{
    _buffer:string = '';
    _flushReserved:number = 0;
    
    _flushToVsCode():void
    {
        clear();
        if (this._buffer)
        {
            log(this._buffer);
            this._buffer = '';
        }
        this._flushReserved = 0;
    }

    end():void
    {
        if (this._flushReserved)
        {
            clearTimeout(this._flushReserved);
            this._flushToVsCode();
        }
        super.end();
    }

    _write(chunk, encoding, done):void
    {
        const str = chunk.toString();
        const CLEAR = '\x1b[1000D\x1b[0K';
        const clearidx = str.lastIndexOf(CLEAR);
        if (clearidx !== -1)
        {
            this._buffer = str.substr(clearidx + CLEAR.length);
            if (!this._flushReserved)
            {
                this._flushReserved = setTimeout(this._flushToVsCode.bind(this), 2000);
            }
        }
        else
        {
            if (!this._flushReserved)
            {
                log(str);
            }
            else
            {
                this._buffer += str;
            }
        }
        done();
    }

    bindWrite()
    {
        return this.write.bind(this);
    }
}

export function log(value:string)
{
    output.appendLine(value);
}

export function show()
{
    output.show();
}

export function clear()
{
    output.clear();
}

export function errorBox(message:string, ...items:string[]):Thenable<string>
{
    return window.showErrorMessage(message, ...items);
}

export function infoBox(msg:string):Thenable<string>
{
    return window.showInformationMessage(msg);
}

export function open(file:string):Thenable<TextEditor>
{
    return workspace.openTextDocument(file)
    .then((doc) => window.showTextDocument(doc));
}
