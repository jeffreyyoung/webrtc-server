const express = require('express');
import * as http from 'http';
import * as WebSocket from 'ws';
import * as EventEmitter from 'events';
import { HalloWebSocket, ConversationsManager, defaultHalloState, initialHalloState } from './ConversationsManager';
import { QueueManager } from './QueueManager';
import { getRandomId } from './randomId';
import { emit } from 'cluster';


export function getServer() {
    const app = express();
    const httpServer = http.createServer(app);
    const io = require('socket.io')(httpServer);

    app.use(express.static('dist'));
    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/dist/index.html')
    });

    io.on('connection', getConnectionHandler());

    //start our server

    return httpServer;
}


const AcceptCandidateTimeout = 4000;
function getConnectionHandler() {
    const conversationManager = new ConversationsManager();
    
    //I think making it async will make it non-blocking?
    const queueManager = new QueueManager(async () => {
        let convo = await queueManager.popFrontTwo();

        if (!convo) { return; }
        
        conversationManager.putUsersInCandidateConversation(convo);

        //this handles whether the users accept the conversation
        let acceptedCandidatePromises = convo.map(s => {
            return new Promise((resolve, reject) => {

                let timeOutId = setTimeout(() => {
                    s.removeListener('accept-conversation-candidate', fn);
                    console.log('rejecting promise');
                    reject('timeout'), AcceptCandidateTimeout
                }, AcceptCandidateTimeout);


                let fn = (payload) => {
                    console.log('clearing timeout id!!!');
                    clearTimeout(timeOutId);
                    s.halloState.hasAcceptedCandidate = true;
                    console.log('emitting')
                    s.emit('accept-conversation-candidate', s.halloState);
                    resolve(true);
                };
                s.once('accept-conversation-candidate', fn);

            });
        });
        
        //tells the two users that there is a possible conversation for them
        //we need to hear back from them to make sure they are still online
        //we will give them 10 seconds to respond
        convo.forEach(c => c.emit('conversation-candidate-found'));
        try {
            //both of the users accepted the invitation
            //put them in a conversation and let the users know they
            //are now part of a conversation
            await Promise.all(acceptedCandidatePromises);
            log('GOT INTO THE CONVERSATION!!!', convo.length);
            //put them in a conversation!!!
            conversationManager.removeCandidateConversation(convo[0].halloState.conversationId);
            conversationManager.putUsersInConversation(convo, getRandomId());
            
            convo.forEach(s => {
                log('emitting!!!!', 'joined-conversation');
                s.emit('joined-conversation', s.halloState);
            });
            //now wait for a user to say the end conversation before ending
        } catch (e) {
            console.log('rejected!!!!');
            //either only one or neither of the users accepted the conversation candidate
            convo.forEach(s => {
                console.log('checking if has accepted', s.halloState.userId);
                let accepted = s.halloState.hasAcceptedCandidate;
                conversationManager.removeUserFromConversation(s);

                //if this user accepted the conversation we should add them back to the front
                //of the queue so that they can be put into a different conversation
                if (accepted) {
                    console.log('adding a dude to the front', s.halloState.userId);
                    queueManager.addToFront(s);
                } else {
                    console.log('removing from conversation', s.halloState.userId);
                    //if they didn't accept, we assume there's network problems and remove them from the queue
                    //they can re-enter once they have a connection
                    conversationManager.removeUserFromConversation(s);
                    
                }

                //let the users know that the candidate did not work out
                //and let them know their current state. ie. whether or not they are
                //in the queue
                console.log('emitting', 'candidate-canceled', s.halloState.userId);
                s.emit('candidate-canceled', s.halloState);
                s.emit('user-info', {
                    ...s.halloState
                });
            });
        }
    });

    function log(...args) {
        console.log('server: ', ...args);
    }

    return function onConnect(socket: HalloWebSocket) {
        socket.halloState = {...initialHalloState};

        //clients can authenticate to associate a socket with a user
        socket.on('authenticate', ({userId}) => {
            log('authenticate', {userId});
            socket.halloState.userId = userId;
            socket.emit('authenticate', {userId});
        });
    
        //just for testing
        socket.on('echo', (payload) => {
            log('echo', payload);
            socket.emit('echo', payload);
        });
    
        //a socket can request the current state of their socket eg isInQueue, conversationId, isInCandidate,
        socket.on('user-info', (payload) => {
            log('user-info', payload);
            socket.emit('user-info', {
                ...socket.halloState,
            });
        });
    
        //sockets can request the current queue size
        socket.on('queue-size', () => {
            log('queue-size');
            socket.emit('queue-size', {
                queueSize: queueManager.getNumInQueue()
            });
        });

        socket.on('server-stats', () => {
            log('server-stats');
            socket.emit('server-stats', {
                queueSize: queueManager.getNumInQueue(),
                numConversations: conversationManager.getNumConversations(),
                numCandidateConversations: conversationManager.getNumConversationCandidates()
            });
        });
    
        //sockets can request to join the queue
        socket.on('join-queue', () => {
            log('join-queue');
            queueManager.addToQueue(socket);
            socket.emit('join-queue');
        });
    
        //sockets can request to leave the queue
        socket.on('leave-queue', () => {
            log('leave-queue');
            queueManager.removeFromQueue(socket);
            socket.emit('leave-queue');
        });

        socket.on('leave-conversation', () => {
            log('leave-conversation');

            let convoAttendees = conversationManager.getConversationOfUser(socket);
            convoAttendees.forEach(s => {
                conversationManager.removeUserFromConversation(s);
                Object.assign(s.halloState, {
                    ...defaultHalloState
                });
                s.emit('leave-conversation', s.halloState);
            });
        });

        //called when a socket disconnects
        socket.on('disconnect', () => {
            queueManager.removeFromQueue(socket);
            conversationManager.removeUserFromConversation(socket);
        });
    }
}

function asyncOnce(socket: HalloWebSocket, event: string) {
    return new Promise(resolve => {
        socket.once(event, (args) => resolve(...args));
    });
}




