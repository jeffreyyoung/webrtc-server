const express = require('express');
import * as http from 'http';
import * as WebSocket from 'ws';
import * as EventEmitter from 'events';
import { getRandomId } from '../utils/randomId';
import { logger } from '../utils/logger';

import { QueueManager } from './QueueManager';
import { RoomManager } from './RoomManager';
import { ConversationManager } from './ConversationManager';
import { getOnAddToQueueFunction } from './onAddToQueue';
import { HalloSocket } from './HalloSocket';
import { socketEvents } from './socketEvents';


//https://medium.com/factory-mind/websocket-node-js-express-step-by-step-using-typescript-725114ad5fe4
var memwatch = require('memwatch-next');

memwatch.on('leak', function(info) {
    console.log('LEAK!!!!', info);
});

//memwatch.on('stats', function(stats) { console.log('stats!!!!', stats); });


export function getServer(port = 4321) {
    const app = express();
    const httpServer = http.createServer(app);
    const WebSocket = require('ws');
    const wss = new WebSocket.Server({ server: httpServer});

    app.use(express.static('dist'));
    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/dist/index.html')
    });

    //stuff
    const conversationManager = new ConversationManager();
    const queueManager = new QueueManager();
    const roomManager = new RoomManager();

    let onAdd = getOnAddToQueueFunction(queueManager, roomManager, conversationManager);
    queueManager.setOnAdd(onAdd);

    wss.on(socketEvents.connection, (ws: WebSocket) => {
        let hs = new HalloSocket(ws);
        hs.on(socketEvents.authenticate, (payload: any): void => {
            logger.server('authenticate', payload.userId);
            //get token from payload
            //add user to room
            hs.state.userId = payload.userId;
            roomManager.join(hs.state.userId, hs);
            hs.emit(socketEvents.authenticate, payload);
        });

        //a socket can request the current state of their socket
        //eg isInQueue, conversationId, isInCandidate
        hs.on(socketEvents.userState, (payload) => {
            //get users current state
            hs.emit(socketEvents.userState, {});
        });

        hs.on(socketEvents.echo, (payload) => {
            //just for testing
            hs.emit(socketEvents.echo, payload);
        });
        
        hs.on(socketEvents.acceptCandidate, (payload) => {
            if (payload && payload.conversationId) {
                roomManager.emitTo(payload.conversationId, {
                    payload,
                    to: payload.conversationId,
                    event: socketEvents.acceptCandidate,
                    from: hs.state.userId
                });
            }
        });

        //sockets can request the current queue size
        hs.on(socketEvents.queueSize, async () => {
            logger.log(socketEvents.queueSize);
            hs.emit(socketEvents.queueSize, {
                queueSize: await queueManager.getNumInQueue()
            });
        });

        hs.on(socketEvents.serverStats, () => {
            logger.log(socketEvents.serverStats);
            hs.emit(socketEvents.serverStats, {
                queueSize: queueManager.getNumInQueue(),
                numConversations: conversationManager.getNumConversations(),
                numCandidateConversations: conversationManager.getNumConversationCandidates()
            });
        });
    
        //sockets can request to join the queue
        //they must be authenticated
        //the socket will be notified whether or not they 
        //were able to join the queue
        hs.on(socketEvents.joinQueue, () => {
            let didJoinQueue = false;
            if (hs.state.userId) {
                queueManager.addToQueue(hs.state.userId);
                didJoinQueue = true;
            }
            
            hs.emit(socketEvents.joinQueue, {didJoinQueue});
        });
    
        //a user can request to leave the queue
        hs.on(socketEvents.leaveQueue, () => {
            logger.log(socketEvents.leaveQueue);
            queueManager.removeFromQueue(hs.state.userId);
            hs.emit(socketEvents.leaveQueue, {});
        });

        //a user can request to leave the current conversation
        // hs.on('leave-conversation', () => {
        //     logger.log('leave-conversation');

        //     let convoAttendees = conversationManager.removeConversationAndGetUsers(hs.state.conversationId);
        //     //delete the conversation
        //     //tell the attendess
        //     if (convoAttendees && convoAttendees.length > 0) {
        //         convoAttendees.forEach((userId: string) => {
        //             roomManager.emitTo(userId, 'leave-conversation', {
        //                 //left conversation state
        //                 //
        //             });
        //         });
        //     }
        // });

        //called when a socket disconnects
        hs.on(socketEvents.disconnect, () => {
            //if the user is in a 
            queueManager.removeFromQueue(hs.state.userId);
        });
        
    });

    //start our server
    //we expect to get a ping every 10 seconds
    return new Promise((resolve,reject) => {
        httpServer.listen(port, '0.0.0.0', (err) => {
            if (err) {
                reject(err);
            }
            resolve(httpServer.address());
        });
    });
}
