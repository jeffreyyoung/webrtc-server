
import { logger } from '../utils/logger';
import { AsyncEventEmitter } from '../utils/AsyncEventEmitter';

export class AsyncClient {
    url: string;
    socket?: WebSocket;
    timeout: number;
    _emitter: AsyncEventEmitter = new AsyncEventEmitter();

    constructor(url, timeout = 30000) {
        this.url = url;
        this.timeout = timeout;
    }

    async connect() {
        let onConnect = this.onceAsync('connect');
        let s = new WebSocket(this.url);
        s.onclose = (event: any) => this._emitter.emit('disconnect', {event});
        s.onerror = (event: any) => this._emitter.emit('error', {event});
        s.onopen = (event: any) => this._emitter.emit('connect', {event});
        s.onmessage = (message: MessageEvent) => {
            let parsed: any = JSON.parse(message.data);
            this._emitter.emit(parsed.event, parsed.payload);
        }
        this.socket = s;
        
        return onConnect;
    }

    emitAndAwait(event1, payload = {}, timeout?: number): Promise<any> {
        this.emit(event1, payload);
        return this.onceAsync(event1, timeout);
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

    onceAsync(event, timeout?: number): Promise<any> {
        return new Promise((resolve, reject) => {
            this._emitter.once(event, (...args) => {
                resolve(...args);
            });
            if (timeout) {
                setTimeout(() => reject('took too long'), timeout);
            }
        });
    }

    getSocketState() {
        if (!this.socket) {
            return 'closed';
        } else {
            switch ( this.socket.readyState) {
                case 0 : return 'connecting';
                case 1 : return 'open';
                case 2 : return 'closing';
                case 3 : return 'closed';
            }
        }
    }

    emit(event, payload) {
        logger.log('emit: ', event, payload);
        if (this.socket && this.getSocketState() === 'open') {
            this.socket.send(JSON.stringify({
                event, payload
            }));
        }
    }

    on(event, fn) {
        return this._emitter.on(event, fn);
    }

    once(event: string, fn) {
        this._emitter.once(event, fn);
        return () => this._emitter.off(event, fn);
    }

    off(event, fn) {
        return this._emitter.off(event, fn);
    }

    disconnect() {
        if (this.socket) {
            let p = this.onceAsync('disconnect');

            this.socket.close();
            return p;
        } else {
            return true;
        }
    }
}