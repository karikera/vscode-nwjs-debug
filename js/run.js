const {spawn} = require('child_process');

/**
 * @param {string} cmd
 * @param {Array<string>} args
 * @param {function(string)} output
 * @return {!Promise<string>}
 */
module.exports = function(cmd, args, output)
{
    return new Promise((resolve)=>{
        const p = spawn(cmd, args);
        p.stdout.on('data', output);
        p.stderr.on('data', output);
        p.on('close', resolve);
    });
};
