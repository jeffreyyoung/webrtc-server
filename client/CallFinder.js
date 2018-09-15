const EventEmitter = require('./HalloEventEmitter');
var HalloSimplePeer = require('./HalloSimplePeer');
const JOIN_CONVERSATION_QUEUE = 'JOIN_CONVERSATION_QUEUE';
const JOIN_CONVERSATION = 'JOIN_CONVERSATION';
const LEAVE_CONVERSATION = 'LEAVE_CONVERSATION';
const LEFT_CONVERSATION = 'LEFT_CONVERSATION';
const CONVERSATION_INFO = 'CONVERSATION_INFO';
const QUEUE_SIZE = 'QUEUE_SIZE';

const serverAddress = 'wss://hallo-server.now.sh';
//const serverAddress = 'ws://localhost:4321';

module.exports = class CallFinder extends EventEmitter {
    constructor() {
        super();
        this.ws = new Socket(serverAddress);
        this.ws.on(JOIN_CONVERSATION, ({isLeader}) => {
            this.peer = new HalloSimplePeer({initiator: isLeader, stream: this.localStream});
            this.peer.on('signal', (data) => {
                this.ws.send(CONVERSATION_INFO, data);
            });
            this.ws.on(CONVERSATION_INFO, (data) => {
                this.peer.signal(data);
            })
            this.peer.on('stream', (remoteStream) => {
                this.remoteStream = remoteStream;
                this.emit('stream', {remoteStream, localStream: this.localStream});
            });
        });
        this.start();
        this.ws.on(QUEUE_SIZE, (data) => {
            console.log('got the queue size!', data);
        });
    }

    async start() {
        this.localStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
        await wait(4000);
        this.ws.send(JOIN_CONVERSATION_QUEUE);
        setInterval(() => {
            this.ws.send(QUEUE_SIZE);
        }, 1000);
    }

}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class Socket extends EventEmitter {
    constructor(url) {
        super();
        this.ws = new WebSocket(url);
        this.ws.onmessage = (msg) => {
            let yay = JSON.parse(msg.data);
            this.emit(yay.type, yay.payload);
        };
    }

    send(event, data = {}) {
        this.ws.send(JSON.stringify({type: event, payload: data}));
    }
}