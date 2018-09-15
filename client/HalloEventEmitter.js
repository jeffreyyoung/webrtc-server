
module.exports = class HalloEventEmitter {
    constructor() {
        this.listeners = {};
    }

    once(type, fn) {
        let off;
        off = this.on(type, (payload) => {
            fn(payload);
            off();
        });
    }

    on(type, fn) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(fn);

        return () => {
            const index = this.listeners[type].indexOf(fn);
            if (index !== -1) {
                this.listeners[type].splice(index, 1);
            }
        }
    }

    emit(type, payload) {
        if (this.listeners[type]) {
            this.listeners[type].forEach(fn => fn(payload));
        }
    }
}