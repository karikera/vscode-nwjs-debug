
const {window, workspace} = require('vscode');
const stream = require('stream');

const output = window.createOutputChannel("NWjs");

class ChannelStream extends stream.Writable
{
    constructor()
    {
        super();
    }
    _write(chunk, encoding, done)
    {
        vs.log(chunk.toString());
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