import { QueueManager } from "./QueueManager";
import { RoomManager, EmitToRoomPayload } from "./RoomManager";
import { ConversationManager } from "./ConversationManager";
import { getRandomId } from "../utils/randomId";
import { Completable } from "../utils/Completable";
import { promises } from "fs";
import { socketEvents } from "./socketEvents";
import { logger } from "../utils/logger";

export function getOnAddToQueueFunction(queueManager: QueueManager, roomManager: RoomManager, conversationManager: ConversationManager) {

    return async () => {
        logger.server('checking for a conversation');
        let convo = await queueManager.popFrontTwo();
        if (!convo) {return;}
        logger.server('found a conversation', convo);
        let acceptResult = await doUsersAcceptConversation(convo, roomManager);
        logger.server('accept result', acceptResult);
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
    logger.server('accept result', 'handleRejectedConversation');
    userAccepts.forEach(ua => {
        if (ua.accepted) {
            //this user accepted add them to the front of the queue
            queueManager.addToFront(ua.userId);
            roomManager.emitTo(ua.userId, {
                event: socketEvents.candidateResult,
                from: 'god',
                to: ua.userId,
                payload: {
                    joinedConversation: false,
                    isInQueue: true
                }
            })
        } else {
            //this user did not accept, do not put them in the queue
            roomManager.emitTo(ua.userId, {
                event: socketEvents.candidateResult,
                from: 'god',
                to: ua.userId,
                payload: {
                    joinedConversation: false,
                    isInQueue: false
                }
            });
        }
    });
}

async function putUsersInConversation(userIds: string[], conversationId: string, roomManager: RoomManager) {
    logger.server('accept result', 'putUsersInConversation');
    userIds.forEach(userId => {
        roomManager.emitTo(userId, {
            from: 'god',
            to: userId,
            event: socketEvents.candidateResult,
            payload: {
                joinedConversation: true,
                conversationId
            }
        });
    });
}

async function doUsersAcceptConversation(userIds: string[], roomManager: RoomManager) {
    const TIMEOUT = 10000; //yall have ten seconds to accept
    return new Promise<doUsersAcceptConversationResult>(async (resolve,reject) => {
        logger.server('checking if both users accept');
        let conversationId = getRandomId();
        let hasRejected = false;
        let didAccepts = [
            new Completable<AcceptCandidate>(),
            new Completable<AcceptCandidate>()
        ];

        //if the users dont accept in time we gotta reject
        setTimeout(() => {
            console.log('timeout!', false);
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