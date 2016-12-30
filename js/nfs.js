
const fs = require('fs');
const path = require('path');


const nfs = {
    /**
     * @param {string} evname
     * @return {!Promise}
     */
    eventToPromise: function(stream, evname)
    {
        return new Promise((resolve)=>{
            stream.on(evname, resolve);
        });
    },
    /**
     * @param {string} file
     * @param {Object=} def
     * @param {boolean=} forceCreate
     */
    readJson: function(file, def, forceCreate)
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
            if (forceCreate && modified) nfs.writeJson(file, obj);
        }
        return obj;
    },
    /**
     * @param {string} file
     * @param {*} obj
     */
    writeJson: function(file, obj)
    {
        fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
    },
    /**
     * @param {string} dirPath
     */
    mkdir:function(dirPath)
    {
        try
        {
            return fs.mkdirSync(dirPath);
        }
        catch(error)
        {
            switch(error.errno)
            {
            case 34:
                nfs.mkdir(path.dirname(dirPath));
                return fs.mkdirSync(dirPath);
            case -4075:
                return;
            }
            throw error;
        }
    },
    /**
     * @param {string} filename
     * @return {!Promise}
     */
    writeTo: function(filename, fos)
    {
        const read = fs.createReadStream(filename);
        read.pipe(fos, {end: false});
        return nfs.eventToPromise(read, 'end');
    },

    /**
     * @param {string} from
     * @param {string} to
     * @return {!Promise}
     */
    copy: function(from, to)
    {
        const fos = fs.createWriteStream(to);
        fs.createReadStream(from).pipe(fos);
        return nfs.eventToPromise(fos, 'close');
    },
};

module.exports = nfs;