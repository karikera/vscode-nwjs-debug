
const vscode = require('vscode');
const {window} = vscode;
const nwjsVersion = '0.14.7-sdk';
const output = window.createOutputChannel("NWjs Install");

const get_path = require('./nwjs/get-path');
const install = require('./nwjs/install');
//const run = require('./nwjs/run')
//const use = require('./nwjs/use')
//const list = require('./nwjs/list')
//const listRemote = require('./nwjs/list-remote')
const remove = require('./nwjs/remove')
const stream = require('stream');
var onProgress = false;

class ChannelStream extends stream.Writable
{
    constructor()
    {
        super();
    }
    _write(chunk, encoding, done)
    {
        output.appendLine(chunk.toString());
        done();
    }

    bindWrite()
    {
        return this.write.bind(this);
    }
}

function errorBox(err)
{
    window.showErrorMessage(err);
}
function infoBox(msg)
{
    window.showInformationMessage(msg);
}

function installNWjs()
{
    const nwjs = get_path();
    if (nwjs !== null)
    {
        window.showInformationMessage("NWjs already installed");
        return;
    }

    console.log("Download NWjs(0.14.7-sdk)...");
    return install(nwjsVersion)
    .then(() => {infoBox("Install complete");});
}

function removeNWjs()
{
    var nwjs = get_path();
    if (nwjs === null)
    {
        infoBox("NWjs already removed");
        return;
    }
    remove(nwjsVersion);
    infoBox("Remove complete");
}

exports.activate = function (context) {
    function regist(command, func)
    {
        function work()
        {
            if (onProgress)
            {
                output.show();
                return;
            }
            onProgress = true;
            output.clear();
            output.show();
            const stdout = process.stdout.write;
            const stderr = process.stderr.write;
            process.stdout.write = new ChannelStream(output).bindWrite();
            process.stderr.write = new ChannelStream(output).bindWrite();

            Promise.resolve()
            .then(func)
            .catch((err)=>{
                console.error(err);
                errorBox(err);
            })
            .then(()=>{
                process.stdout.write = stdout;
                process.stderr.write = stderr;
                onProgress = false;
            });
        }
        const disposable = vscode.commands.registerCommand(command, work);
        context.subscriptions.push(disposable);
    }

    regist('vscode-nwjs.install', installNWjs);
    regist('vscode-nwjs.remove', removeNWjs);
};
exports.deactivate = function() {
};
