
const os = require('./os');

module.exports = function(version)
{
    const realVersion = version.split('-sdk').shift();
    const fileName = version == realVersion ? `nwjs-v${realVersion}-${os.platform}-${os.arch}` : `nwjs-sdk-v${realVersion}-${os.platform}-${os.arch}`;
    const ext = os.platform === 'linux' ? 'tar.gz' : 'zip';
    const url = `http://dl.nwjs.io/v${realVersion}/${fileName}.${ext}`;
    return {realVersion, fileName, ext, url};
};
