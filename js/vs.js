
const {window, workspace} = require('vscode');
const stream = require('stream');

const output = window.createOutputChannel("NWjs");

class ChannelStream extends stream.Writable
{
    constructor()
    {
        super();
        /** @type {string} */
        this._buffer = '';
        /** @type {number} */
        this._flushReserved = 0;
    }
    _flushToVsCode()
    {
        vs.clear();
        if (this._buffer)
        {
            vs.log(this._buffer);
            this._buffer = '';
        }
        this._flushReserved = 0;
    }
    end()
    {
        if (this._flushReserved)
        {
            clearTimeout(this._flushReserved);
            this._flushToVsCode();
        }
        super.end();
    }
    _write(chunk, encoding, done)
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
                vs.log(str);
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

const vs = module.exports = {
    ChannelStream: ChannelStream,
    /**
     * @param {string} str
     */
    log(value)
    {
        output.appendLine(value);
    },
    show()
    {
        output.show();
    },
    clear()
    {
        output.clear();
    },

    /**
     * @param {string} err
     * @param {...string} items
     * @return {!Promise<string|undefined>}
     */
    errorBox(err, items)
    {
        return window.showErrorMessage(...arguments);
    },
    /**
     * @param {string} msg
     * @return {!Promise<undefined>}
     */
    infoBox(msg)
    {
        window.showInformationMessage(msg);
    },
    /**
     * @param {string} file
     * @return {!Promise}
     */
    open(file)
    {
        return workspace.openTextDocument(file)
        .then((doc) => window.showTextDocument(doc));
    }
};