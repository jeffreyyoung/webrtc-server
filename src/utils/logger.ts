

export let logger = {
    log(...args)  {
        console.log(...args);
    },
    server(...args) {
        console.log('server:', ...args);
    },
    client(...args) {
        console.log('client: ', ...args);
    }
}

