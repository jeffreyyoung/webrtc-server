import * as WebSocket from 'ws';
import { AsyncEventEmitter } from '../utils/AsyncEventEmitter';

type SocketState = {
    conversationId: string
    userId: string
    isInQueue: boolean
};

export class HalloSocket {
    //native web socket
    _socket: WebSocket

    //event emitter with some async functionality
    _emitter: AsyncEventEmitter

    //the default state of the user
    //based on this we can learn whether or not the user is:
    // * authenticated
    // * in the queue
    // * in a conversation
    state: SocketState = HalloSocket.getDefaultState();

    //whether or not the current socket is connected
    //if not it will get cleaned up
    isAlive: boolean = false;

    //off functions that will be called to clean up this socket
    _offs: (() => void)[] = [];

    constructor(socket: WebSocket) {
        this._socket = socket;
        this._emitter = new AsyncEventEmitter();

        //event to keep this thing alive
        this._socket.on('pong', () => {
            console.log('pong');
            //https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
            this.isAlive = true;
        });

        //parse messages and let HalloSocket handle them
        this._socket.on('message', (message: string) => {
            let parsed = JSON.parse(message);
            this._emitter.emit(parsed.event, parsed.payload);
        });

        //do required cleanup on close
        this._socket.on('close', () => {
            this.terminate();
        });
        
    }

    static getDefaultState(): SocketState {
        return {
            conversationId: "",
            userId: "",
            isInQueue: false
        };
    }

    //this function will be called before
    //we destructure this socket
    registerOff(fn: () => any) {
        this._offs.push(fn);
    }

    on(event: string, fn: (payload: any) => void) {
        this._emitter.on(event, fn);
    }

    off(event: string, fn: any) {
        this._emitter.off(event, fn);
    }

    once(event: string, fn: any) {
        this._emitter.once(event, fn);
    }

    onceAsync(event: string) {
        return this._emitter.asyncOnce(event);
    }

    emit(event: string, payload: any) {
        if (this._socket.readyState === WebSocket.OPEN) {
            let bundle = {event, payload};
            let msg = JSON.stringify(bundle);
            this._socket.send(msg);
        }
    }

    //terminate the current socket
    terminate() {
        this._emitter.removeAllListeners();
        this._offs.forEach(o => o());
        this._socket.terminate();
    }
}
