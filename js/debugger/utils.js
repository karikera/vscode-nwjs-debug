
const {logger} = require('../../node_modules/vscode-chrome-debug-core');



class DebounceHelper
{
    constructor(timeoutMs)
    {
        this.timeoutMs = timeoutMs;
        this.waitToken = null;
    }
    wait(fn)
    {
        if (!this.waitToken) {
            this.waitToken = setTimeout(() => {
                this.waitToken = null;
                fn();
            },
                this.timeoutMs);
        }
    }
    doAndCancel(fn)
    {
        if (this.waitToken) {
            clearTimeout(this.waitToken);
            this.waitToken = null;
        }

        fn();
    }
}

var utils = {
    DebounceHelper: DebounceHelper,
    getAllFunctions: function(obj)
    {
        var added = {};
        var funcs = [];
        do
        {
            funcs = funcs.concat(Object.getOwnPropertyNames(obj).filter((p) => {
                var desc = Object.getOwnPropertyDescriptor(obj, p);
                if (desc.get) return false;
                if (!(obj[p] instanceof Function)) return false;
                if (p in added) return false;
                added[p] = true;
                return true;
            }));
        }
        while (obj = Object.getPrototypeOf(obj));
        return funcs;
    },
    createFunctionListener: function(obj, name)
    {
        for(let funcname of utils.getAllFunctions(obj))
        {
            let oldfunc = obj[funcname];
            obj[funcname] = function()
            {
                var args = Array.prototype.map.call(arguments, (v)=>{
                    try
                    {
                        return JSON.stringify(v);
                    }
                    catch(e)
                    {
                        if (!v.consturctor)
                        {
                            return "[circular object]"
                        }
                        return "["+v.consturctor.name+"]";
                    }
                });
                logger.error(name+"."+funcname+"("+args.join(',')+")");
                return oldfunc.apply(this, arguments);
            };
        }
    },
};

module.exports = utils;
