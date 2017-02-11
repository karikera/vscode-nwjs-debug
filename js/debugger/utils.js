/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

const {logger} = require('../../node_modules/vscode-chrome-debug-core');

class DebounceHelper {

    constructor(timeoutMs) {
        this.timeoutMs = timeoutMs;
        this.waitToken = null;
    }

    /**
     * If not waiting already, call fn after the timeout
     */
    wait(fn) {
        if (!this.waitToken) {
            this.waitToken = setTimeout(() => {
                this.waitToken = null;
                fn();
            },
                this.timeoutMs);
        }
    }

    /**
     * If waiting for something, cancel it and call fn immediately
     */
    doAndCancel(fn) {
        if (this.waitToken) {
            clearTimeout(this.waitToken);
            this.waitToken = null;
        }

        fn();
    }
}

const utils = {
    DebounceHelper: DebounceHelper,
    getAllFunctions(obj)
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
    createFunctionListener(obj, name)
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
