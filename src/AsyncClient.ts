import io from 'socket.io-client';
import { logger } from './logger';

export class AsyncClient {
    url: string;
    socket: any;
    timeout: number;

    constructor(url, timeout = 30000) {
        this.url = url;
        this.timeout = timeout;
    }

    async connect() {
        this.socket = io(this.url, {
            reconnection: false
        });
        return this.onceAsync('connect', false);   
    }

    emitAndAwait(event1, payload = {}, useTimeout = true): Promise<any> {
        this.emit(event1, payload);
        return this.onceAsync(event1, useTimeout);
    }

    onceManyAsync(...events: string[]): Promise<[string, any]> {
        return new Promise((resolve, reject) => {
            let offs = events.map(event => {
                let off = this.once(event, (payload) => {
                    resolve([event, payload]);
                    //call off on all the other functions
                    offs.filter(o => o !== off).forEach(o => o());
                });
                return off;
            })
        });
    }

    onceAsync(event, withTimeout = true): Promise<any> {
        logger.log('onceAsync', event);
        return new Promise((resolve, reject) => {
            this.socket.once(event, (...args) => {
                logger.log('resolve : ', event);
                resolve(...args);
            });
            if (withTimeout) {
                setTimeout(() => reject('took too long'), this.timeout);
            }
        });
    }

    emit(...args) {
        logger.log('emit: ', ...args);
        return this.socket.emit(...args);
    }

    on(...args) {
        return this.socket.on(...args);
    }

    once(event: string, fn) {
        this.socket.once(event, fn);

        return () => this.socket.off(event, fn);
    }

    off(...args) {
        return this.socket.off(...args);
    }

    disconnect() {
        let p = this.onceAsync('disconnect');
        this.socket.close();
        return p;
    }
}