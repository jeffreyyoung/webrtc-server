import * as express from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as EventEmitter from 'events';


const app = express();
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html')
});

type HalloWebSocket = WebSocket & {conversationId: string};

const JOIN_CONVERSATION_QUEUE = 'JOIN_CONVERSATION_QUEUE';
const JOIN_CONVERSATION = 'JOIN_CONVERSATION';
const LEAVE_CONVERSATION = 'LEAVE_CONVERSATION';
const LEFT_CONVERSATION = 'LEFT_CONVERSATION';
const CONVERSATION_INFO = 'CONVERSATION_INFO';
//todo: type this
const queue: HalloWebSocket[] = [];
const conversations: {
    [conversationId: string]: HalloWebSocket[]
} = {};
//initialize a simple http server
const server = http.createServer(app);

//initialize the WebSocket server instance
const wss = new WebSocket.Server({ server });


function createConversationIfPossible() {
    if (queue.length >= 2) {
        console.log('CREATING CONVERSATION');
        const ws1 = queue[0];
        const ws2 = queue[1];
        queue.shift();
        queue.shift();

        const id = getId();
        ws1.conversationId = id;
        ws2.conversationId = id;
        conversations[id] = [ws1, ws2];
        emit(ws1, JOIN_CONVERSATION, {isLeader: true});
        emit(ws2, JOIN_CONVERSATION, {isLeader: false});
    }
}

function handleDisconnect(socket: HalloWebSocket) {
    leaveConversation(socket);
    leaveQueue(socket);
}
  
function leaveQueue(socket: HalloWebSocket) {
const queueIndex = queue.indexOf(socket);
    if (queueIndex !==-1) {
        queue.splice(queueIndex, 1);
    }
}

function addToQueue(ws: HalloWebSocket) {
    queue.push(ws);
    createConversationIfPossible();
}

function leaveConversation(socket: HalloWebSocket) {
    leaveQueue(socket);
    const id = socket.conversationId;
    const conversation = conversations[id];
    socket.conversationId = null;
    if (conversation) {
      conversations[id] = conversation.filter(s => s !== socket);
      if (conversations[id].length === 0) {
        delete conversations[id];
      } else {
        conversation.forEach(s => emit(s, LEAVE_CONVERSATION));
      }
    }
    console.log('num coversations', Object.keys(conversations).length);
  }

function sendConversationInfo(ws: HalloWebSocket, info: any) {
    const conversation = conversations[ws.conversationId];
    console.log('send conversation info???');
    if (conversation) {
      conversation
        .filter(s => s !== ws)
        .forEach(s => {
            emit(s, CONVERSATION_INFO, info);
      });
    }
}


function emit(ws, type: string, payload: any = {}) {
    const data = JSON.stringify({type, payload});
    console.log('emitting', data);
    ws.send(data);
}

wss.on('connection', (ws: HalloWebSocket) => {
    const handler = new EventEmitter();

    handler.on(JOIN_CONVERSATION_QUEUE, () => {
        console.log('add to queue');
        addToQueue(ws);
    });

    handler.on(LEFT_CONVERSATION, () => {
        console.log('left conversation');
        leaveConversation(ws);
    });

    handler.on(CONVERSATION_INFO, (info) => {
        console.log(CONVERSATION_INFO);
        sendConversationInfo(ws, info);
    });


    //connection is up, let's add a simple simple event
    ws.on('message', (message: string) => {
        const parsed = JSON.parse(message) as {type: string, payload: any};
        console.log('message????', parsed);
        handler.emit(parsed.type, parsed.payload);
    });
});

function getId() {
    // Math.random should be unique because of its seeding algorithm.
    // Convert it to base 36 (numbers + letters), and grab the first 9 characters
    // after the decimal.
    return '_' + Math.random().toString(36).substr(2, 18);
  };

//start our server
server.listen(process.env.PORT || 4321, () => {
    console.log(`Server started on port ${JSON.stringify(server.address())} :)`);
});