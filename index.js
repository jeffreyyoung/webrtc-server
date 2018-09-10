"use strict";
exports.__esModule = true;
var express = require("express");
var http = require("http");
var WebSocket = require("ws");
var EventEmitter = require("events");
var app = express();
app.use(express.static('public'));
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/public/index.html');
});
var JOIN_CONVERSATION_QUEUE = 'JOIN_CONVERSATION_QUEUE';
var JOIN_CONVERSATION = 'JOIN_CONVERSATION';
var LEAVE_CONVERSATION = 'LEAVE_CONVERSATION';
var LEFT_CONVERSATION = 'LEFT_CONVERSATION';
var CONVERSATION_INFO = 'CONVERSATION_INFO';
//todo: type this
var queue = [];
var conversations = {};
//initialize a simple http server
var server = http.createServer(app);
//initialize the WebSocket server instance
var wss = new WebSocket.Server({ server: server });
function createConversationIfPossible() {
    if (queue.length >= 2) {
        console.log('CREATING CONVERSATION');
        var ws1 = queue[0];
        var ws2 = queue[1];
        queue.shift();
        queue.shift();
        var id = getId();
        ws1.conversationId = id;
        ws2.conversationId = id;
        conversations[id] = [ws1, ws2];
        emit(ws1, JOIN_CONVERSATION, { isLeader: true });
        emit(ws2, JOIN_CONVERSATION, { isLeader: false });
    }
}
function handleDisconnect(socket) {
    leaveConversation(socket);
    leaveQueue(socket);
}
function leaveQueue(socket) {
    var queueIndex = queue.indexOf(socket);
    if (queueIndex !== -1) {
        queue.splice(queueIndex, 1);
    }
}
function addToQueue(ws) {
    queue.push(ws);
    createConversationIfPossible();
}
function leaveConversation(socket) {
    leaveQueue(socket);
    var id = socket.conversationId;
    var conversation = conversations[id];
    socket.conversationId = null;
    if (conversation) {
        conversations[id] = conversation.filter(function (s) { return s !== socket; });
        if (conversations[id].length === 0) {
            delete conversations[id];
        }
        else {
            conversation.forEach(function (s) { return emit(s, LEAVE_CONVERSATION); });
        }
    }
    console.log('num coversations', Object.keys(conversations).length);
}
function sendConversationInfo(ws, info) {
    var conversation = conversations[ws.conversationId];
    console.log('send conversation info???');
    if (conversation) {
        conversation
            .filter(function (s) { return s !== ws; })
            .forEach(function (s) {
            emit(s, CONVERSATION_INFO, info);
        });
    }
}
function emit(ws, type, payload) {
    if (payload === void 0) { payload = {}; }
    var data = JSON.stringify({ type: type, payload: payload });
    console.log('emitting', data);
    ws.send(data);
}
wss.on('connection', function (ws) {
    var handler = new EventEmitter();
    handler.on(JOIN_CONVERSATION_QUEUE, function () {
        console.log('add to queue');
        addToQueue(ws);
    });
    handler.on(LEFT_CONVERSATION, function () {
        console.log('left conversation');
        leaveConversation(ws);
    });
    handler.on(CONVERSATION_INFO, function (info) {
        console.log(CONVERSATION_INFO);
        sendConversationInfo(ws, info);
    });
    //connection is up, let's add a simple simple event
    ws.on('message', function (message) {
        var parsed = JSON.parse(message);
        console.log('message????', parsed);
        handler.emit(parsed.type, parsed.payload);
    });
});
function getId() {
    // Math.random should be unique because of its seeding algorithm.
    // Convert it to base 36 (numbers + letters), and grab the first 9 characters
    // after the decimal.
    return '_' + Math.random().toString(36).substr(2, 18);
}
;
//start our server
server.listen(process.env.PORT || 4321, function () {
    console.log("Server started on port " + JSON.stringify(server.address()) + " :)");
});
