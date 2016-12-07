
function DebounceHelper(timeoutMs)
{
    this.timeoutMs = timeoutMs;
}

DebounceHelper.prototype.timeoutMs = 0;
DebounceHelper.prototype.waitToken = null;

DebounceHelper.prototype.wait = function(fn)
{
    if (!this.waitToken) {
        this.waitToken = setTimeout(() => {
            this.waitToken = null;
            fn();
        },
            this.timeoutMs);
    }
};

DebounceHelper.prototype.doAndCancel = function(fn)
{
    if (this.waitToken) {
        clearTimeout(this.waitToken);
        this.waitToken = null;
    }

    fn();
};

var util = {
    DebounceHelper: DebounceHelper
};

module.exports = util;
