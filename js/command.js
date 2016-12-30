
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const glob = require('glob-all');
const co = require('co');

const {window, commands} = require('vscode');
const nwjs = require('./nwjs/nwjs');
const os = require('./nwjs/os');
const run = require('./run');
const nfs = require('./nfs');
const vs = require('./vs');
const util = require('./util');

const NOT_INSTALL = 'NOT_INSTALL';
const NEED_PUBLISH_JSON = 'NEED_PUBLISH_JSON';
const NEED_PACKAGE_JSON = 'NEED_PACKAGE_JSON';

const DEFAULT_PACKAGE_JSON = {
    name: 'untitled',
    main: 'index.html'
};
const DEFAULT_PUBLISH_JSON = {
	"package":{},
	"html":["index.html"],
	"files":[],
	"exclude": []
};

var onProgress = false;
var selectedFile = '';
var selectedDir = '';

/**
 * @param {string} filename
 * @param {string} ext
 */
function replaceExt(filename, ext)
{
    const extidx = filename.lastIndexOf('.');
    if (Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) < extidx)
        return filename.substr(0,extidx) + '.'+ext;
    else
        return filename + '.'+ext;
}

function *installNWjs()
{
    var downloaded = false;
    downloaded = (yield nwjs.install(nwjs.defaultVersion)) || downloaded;
    downloaded = (yield nwjs.install(nwjs.defaultVersion+'-sdk')) || downloaded;
    if(downloaded) vs.infoBox("Install complete");
    else vs.infoBox("NWjs already installed");
}

function *removeNWjs()
{
    var res = false;
    res = nwjs.remove(nwjs.defaultVersion) || res;
    res = nwjs.remove(nwjs.defaultVersion+'sdk') || res;
    if (res) vs.infoBox("Remove complete");
    else vs.infoBox("NWjs already removed");
}

/**
 * @param {string=} filename
 * @param {string=} outputFile
 */
function *compileNWjs(filename, outputFile)
{
    if (!filename) filename = selectedFile;
    if (!outputFile) outputFile = replaceExt(filename, '.bin');

    const path = nwjs.getNwjc(nwjs.defaultVersion+'-sdk');
    if (path === null) throw new Error(NOT_INSTALL);
    yield run(path, [filename, outputFile], (str)=>vs.vs.log(str));
}

/**
 * @param {string} html
 * @param {!Object} compileTargets
 * @return {string}
 */
function replaceScriptTag(html, compileTargets)
{
    const regexp = /<script([ \t]+[^>]+)?>/g;
    const prop = /[ \t]+src=(["'])([^"']+)\1/;
    var out = '';
    var previous = 0;
    for(;;)
    {
        const res = regexp.exec(html);
        if (!res) break;
        const propres = prop.exec(res[1]);
        const end = html.indexOf("</script>", regexp.lastIndex);
        if (propres && propres[2])
        {
            const src = propres[2];
            out += html.substring(previous, res.index);
            const output = replaceExt(src,'bin');
            out += `<script>require('nw.gui').Window.get().evalNWBin(null, '${output}');</script>`;
            previous = end+9;
            compileTargets[src] = output;
        }
        regexp.lastIndex = end + 9;
    }
    out += html.substr(previous);
    return out;
}

/**
 * @param {string} outdir
 * @param {string} version
 * @param {string} nwfile
 * @param {!Object} packageJson
 * @param {!Array<string>} exclude
 */
function * makeNWjs(outdir, version, nwfile, packageJson, exclude)
{
    const excludeMap = {};
    for(const ex of exclude)
        excludeMap[ex] = true;
    excludeMap['nw.exe'] = true;

    const srcdir = nwjs.getRootPath(version);
    for(const src of glob.sync([srcdir+'/**']))
    {
        const name = src.substr(srcdir.length+1);
        if (name in excludeMap) continue;
        const dest = path.join(outdir,name);
        if (fs.statSync(src).isDirectory())
        {
            try{fs.mkdirSync(dest);}catch(e){}
        }
        else
        {
            yield nfs.copy(src, dest);
        }
    }

    if(os.platform === 'osx')
    {
        // Contents/Resources/nw.icns: icon of your app.
        // Contents/Info.plist: the apple package description file.
        yield nfs.copy(nwfile, path.join(outdir,'nwjs.app/Contents/Resources/app.nw'));
    }
    else
    {
        const nwjsPath = nwjs.getPath(version);
        const exepath = path.join(outdir, packageJson.name+'.exe');
        const fos = fs.createWriteStream(exepath);
        yield nfs.writeTo(nwjsPath, fos);
        yield nfs.writeTo(nwfile, fos);
        fos.end();
    }
}

function * publishNWjs()
{
    const version = nwjs.defaultVersion;
    if (!window.activeTextEditor) return;
    const nwjsPath = nwjs.getPath(version);
    if (nwjsPath === null) throw new Error(NOT_INSTALL);
    const curdir = process.cwd();
    process.chdir(path.dirname(window.activeTextEditor.document.fileName));

    const config = nfs.readJson('nwjs.publish.json', DEFAULT_PUBLISH_JSON);
    if (!config) throw new Error(NEED_PUBLISH_JSON);

    const targets = {};
    const bindir = 'bin';
    const publishdir = 'publish';
    const packagejson = nfs.readJson('package.json', DEFAULT_PACKAGE_JSON);
    if (!packagejson) throw new Error(NEED_PACKAGE_JSON);

    const {html, files, exclude} = config;
    util.override(packagejson, config.package);

    nfs.mkdir(bindir);
    nfs.mkdir(publishdir);
    const zippath = path.join(bindir, packagejson.name+'.zip');
    vs.show();
    vs.log('Conver html...');

    const archive = archiver('zip', {store: true});
    const zipfos = fs.createWriteStream(zippath);
    archive.pipe(zipfos);

    function appendText(filename, text)
    {
        archive.append(text, { name: filename });
    }
    function appendFile(filename, from)
    {
        if (from === undefined) from = filename;
        archive.file(from, { name: filename });
    }

    appendText('package.json', JSON.stringify(packagejson));

    for(const src of glob.sync(html))
    {
        vs.log(src);
        appendText(src, replaceScriptTag(fs.readFileSync(src,'utf-8'), targets));
    }
    vs.log('Compile js...');
    for(const src in targets)
    {
        vs.log(src);
        const binfilename = targets[src];
        const dest = path.join(bindir, binfilename);
        nfs.mkdir(path.dirname(dest));
        yield compileNWjs(src, dest);
        appendFile(binfilename, dest);
    }
    vs.log('Add files...');
    for(const src of glob.sync(files))
    {
        if (fs.statSync(src).isDirectory()) continue;
        vs.log(src);
        appendFile(src);
    }

    vs.log('Flush zip...');
    archive.finalize();
    yield nfs.eventToPromise(zipfos, 'close');

    vs.log('Generate exe...');
    yield * makeNWjs(publishdir,version,zippath,packagejson, exclude);
    process.chdir(curdir);
    vs.log('Complete');
}

function *generatePublishJson()
{
    nfs.writeJson('nwjs.publish.json', DEFAULT_PUBLISH_JSON);
    vs.open(path.resolve('nwjs.publish.json'));
}

function *generatePackageJson()
{
    nfs.writeJson('package.json', DEFAULT_PACKAGE_JSON);
    vs.open(path.resolve('package.json'));
}

/**
 * @param {function*()} genfunc
 * @return {!Promise}
 */
function play(genfunc)
{
    return co(genfunc())
    .catch((err)=>{
        switch(err.message)
        {
        case NOT_INSTALL:
            return vs.errorBox('Need install NWjs!', 'Install')
            .then((select)=>{
                if (!select) return;
                return play(installNWjs);
            });
        case NEED_PUBLISH_JSON:
            return vs.errorBox('Need nwjs.publish.json!', 'Generate')
            .then((select)=>{
                if (!select) return;
                return play(generatePublishJson);
            });
        case NEED_PACKAGE_JSON:
            return vs.errorBox('Need package.json!', 'Generate')
            .then((select)=>{
                if (!select) return;
                return play(generatePackageJson);
            });
        default:
            console.error(err);
            vs.errorBox(err);
            break;
        }
    });
}

exports.activate = function (context) {
    console.log('[extension: vscode-nwjs] activate');
    function regist(command, genfunc)
    {
        const disposable = commands.registerCommand(command, ()=>{
            if (onProgress)
            {
                vs.show();
                return;
            }
            onProgress = true;
            vs.clear();
            vs.show();
            const stdout = process.stdout.write;
            const stderr = process.stderr.write;
            process.stdout.write = new vs.ChannelStream().bindWrite();
            process.stderr.write = new vs.ChannelStream().bindWrite();
            var olddir = '';
            if (window.activeTextEditor)
            {
                selectedFile = window.activeTextEditor.document.fileName;
                selectedDir = path.dirname(selectedFile);
                olddir = process.cwd();
                process.chdir(selectedDir);
            }
            else
            {
                selectedFile = '';
                selectedDir = '';
            }
            play(genfunc).then(()=>{
                if(olddir) process.chdir(olddir);
                process.stdout.write = stdout;
                process.stderr.write = stderr;
                onProgress = false;
            });
        });
        context.subscriptions.push(disposable);
    }

    regist('vscode-nwjs.install', installNWjs);
    regist('vscode-nwjs.remove', removeNWjs);
    regist('vscode-nwjs.publish', publishNWjs);
    regist('vscode-nwjs.compile', compileNWjs);
};
exports.deactivate = function() {
    console.log('[extension: vscode-nwjs] deactivate');
};
