import { QueueManager } from "./QueueManager";
import { RoomManager, EmitToRoomPayload } from "./RoomManager";
import { ConversationManager } from "./ConversationManager";
import { getRandomId } from "../utils/randomId";
import { Completable } from "../utils/Completable";
import { promises } from "fs";
import { socketEvents } from "./socketEvents";

export function getOnAddToQueueFunction(queueManager: QueueManager, roomManager: RoomManager, conversationManager: ConversationManager) {

    return async () => {
        let convo = await queueManager.popFrontTwo();
        if (!convo) {return;}
        let acceptResult = await doUsersAcceptConversation(convo, roomManager);
        if (acceptResult.accepted) {
            //put users in conversation
            putUsersInConversation(convo, acceptResult.conversationId, roomManager);
            
        } else {
            //handle rejected conversation
            handleRejectedConversation(acceptResult.results, roomManager, queueManager);
        }
    }
}

type AcceptResult = {
    doAccept: boolean
    conversationId: string
}

type AcceptCandidate = {
    accepted: boolean
}

type UserAccept = {
    userId: string
    accepted: boolean
}

type doUsersAcceptConversationResult = {
    accepted: boolean,
    conversationId: string,
    results: UserAccept[]
}

async function handleRejectedConversation(userAccepts: UserAccept[], roomManager: RoomManager, queueManager: QueueManager) {
    userAccepts.forEach(ua => {
        if (ua.accepted) {
            //this user accepted add them to the front of the queue
            queueManager.addToFront(ua.userId);
            roomManager.emitTo(ua.userId, {
                event: socketEvents.candidateRejected,
                from: 'god',
                to: ua.userId,
                payload: {
                    isInQueue: true
                }
            })
        } else {
            //this user did not accept, do not put them in the queue
            roomManager.emitTo(ua.userId, {
                event: socketEvents.candidateRejected,
                from: 'god',
                to: ua.userId,
                payload: {
                    isInQueue: false
                }
            });
        }
    });
}

async function putUsersInConversation(userIds: string[], conversationId: string, roomManager: RoomManager) {
    userIds.forEach(userId => {
        roomManager.emitTo(userId, {
            from: 'god',
            to: userId,
            event: socketEvents.joinedConveration,
            payload: {
                conversationId
            }
        });
    });
}

async function doUsersAcceptConversation(userIds: string[], roomManager: RoomManager) {
    const TIMEOUT = 10000; //yall have ten seconds to accept
    return new Promise<doUsersAcceptConversationResult>(async (resolve,reject) => {
        let conversationId = getRandomId();
        let hasRejected = false;
        let didAccepts = [
            new Completable<AcceptCandidate>(),
            new Completable<AcceptCandidate>()
        ];

        //if the users dont accept in time we gotta reject
        setTimeout(() => {
            didAccepts[0].resolve({accepted: false});
            didAccepts[1].resolve({accepted: false});
        }, TIMEOUT);

        
        //wait for the users to accept
        let off = roomManager.on(conversationId, (payload: EmitToRoomPayload) => {
            let userIndex = userIds.indexOf(payload.from);
            if (userIndex !== -1 && payload.event === socketEvents.acceptCandidate) {
                didAccepts[userIndex].resolve({accepted: true});
            }
        });

        //tell the users about the conversation
        userIds.forEach(userId => {
            roomManager.emitTo(userId, {
                event: socketEvents.conversationCandidate,
                payload: {
                    conversationId
                },
                to: userId,
                from: 'god'
            });
        });

        let results = await Promise.all(didAccepts.map(d => d.promise));
        //clean up room manager listener
        off();
        resolve({
            conversationId,
            accepted: results.every(r => r.accepted),
            results: userIds.map((id, index) => ({
                accepted: results[index].accepted,
                userId: id
            }))
        });
    });
}
/*
const queueManager = new QueueManager(async () => {
    let convo = await queueManager.popFrontTwo();

    if (!convo) { return; }
    
    conversationManager.putUsersInCandidateConversation(convo);

    //this handles whether the users accept the conversation
    let acceptedCandidatePromises = convo.map(s => {
        return new Promise((resolve, reject) => {

            let timeOutId = setTimeout(() => {
                s.removeListener('accept-conversation-candidate', fn);
                logger.log('rejecting promise');
                reject('timeout'), AcceptCandidateTimeout
            }, AcceptCandidateTimeout);


            let fn = (payload) => {
                logger.log('clearing timeout id!!!');
                clearTimeout(timeOutId);
                s.halloState.hasAcceptedCandidate = true;
                logger.log('emitting')
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
        logger.log('GOT INTO THE CONVERSATION!!!', convo.length);
        //put them in a conversation!!!
        conversationManager.removeCandidateConversation(convo[0].halloState.conversationId);
        conversationManager.putUsersInConversation(convo, getRandomId());
        
        convo.forEach(s => {
            logger.log('emitting!!!!', 'joined-conversation');
            s.emit('joined-conversation', s.halloState);
            if (s.halloState.conversationId) {
                if (!conversationManager.conversations[s.halloState.conversationId]) {
                    console.log('WE SHULD NEVER BE HERE!!!!!');
                } else {
                    console.log('all goodl');
                }
            } 
        });
        //now wait for a user to say the end conversation before ending
    } catch (e) {
        logger.log('rejected!!!!');
        //either only one or neither of the users accepted the conversation candidate
        convo.forEach(s => {
            logger.log('checking if has accepted', s.halloState.userId);
            let accepted = s.halloState.hasAcceptedCandidate;
            conversationManager.removeUserFromConversation(s);

            //if this user accepted the conversation we should add them back to the front
            //of the queue so that they can be put into a different conversation
            if (accepted) {
                logger.log('adding a dude to the front', s.halloState.userId);
                queueManager.addToFront(s);
            } else {
                logger.log('removing from conversation', s.halloState.userId);
                //if they didn't accept, we assume there's network problems and remove them from the queue
                //they can re-enter once they have a connection
                conversationManager.removeUserFromConversation(s);
                
            }

            //let the users know that the candidate did not work out
            //and let them know their current state. ie. whether or not they are
            //in the queue
            logger.log('emitting', 'candidate-canceled', s.halloState.userId);
            s.emit('candidate-canceled', s.halloState);
            s.emit('user-info', {
                ...s.halloState
            });
        });
    }
});


*/