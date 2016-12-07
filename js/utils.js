
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

module.exports = {
    DebounceHelper: DebounceHelper
};
