import * as WebSocket from 'ws';
import { getRandomId } from './randomId';

type HalloSocketState = {hasAcceptedCandidate: boolean, isInCandidate: boolean, isInConversation: boolean, isInQueue: boolean, conversationId?: string, userId?: string};
export type HalloWebSocket = WebSocket & {halloState: HalloSocketState};
    
export const defaultHalloState = {
    isInCandidate: false,
    isInConversation: false,
    conversationId: '',
    isInQueue: false,
    hasAcceptedCandidate: false
};

export const initialHalloState = {
    userId: '',
    ...defaultHalloState
}

type conversationStore = {
    [conversationId: string]: HalloWebSocket[]
}

export class ConversationsManager {
    static candidateConversationTimeout = 10;
    conversations: conversationStore = {};
    candidateConversations: conversationStore = {};

    getNumConversations() {
        return Object.keys(this.conversations).length;
    }

    getNumConversationCandidates() {
        return Object.keys(this.candidateConversations).length;
    }

    getConversationOfUser(socket: HalloWebSocket): HalloWebSocket[] {
        const cId = socket.halloState.conversationId;
        if (cId && this.conversations[cId]) {
            return [...this.conversations[cId]];
        }

        return [];
    }

    putUsersInCandidateConversation(socketsIn: HalloWebSocket[]) {
        let sockets = [...socketsIn];
        const cId = getRandomId();
        sockets.forEach(s => {
            Object.assign(s.halloState, {
                ...defaultHalloState,
                conversationId: cId,
                isInCandidate: true,
                isInQueue: false,
                isInConversation: false
            });
        });
        this.candidateConversations[cId] = [...sockets];
    }

    removeCandidateConversation(id) {
        let candidate = this.candidateConversations[id];

        candidate.forEach(c => {
            c.halloState.conversationId = undefined;
            c.halloState.isInCandidate = false;
        });

        delete this.candidateConversations[id];

        return candidate;
    }

    putUsersInConversation(socketsIn: HalloWebSocket[], conversationId: string) {
        let sockets = [...socketsIn];
        if (sockets[0].halloState.conversationId && this.candidateConversations[sockets[0].halloState.conversationId || '']) {
            throw 'WE SHOULD NOEVER BE HERE!!!!!!!!!!!'
        }
        sockets.forEach(s => {
            Object.assign(s.halloState, {
                ...defaultHalloState,
                conversationId,
                isInConversation: true
            });
            
            if (!this.conversations[conversationId]) {
                this.conversations[conversationId] = [];
            }
            s.halloState.conversationId = conversationId;
        });

        this.conversations[conversationId] = [...sockets];
    }

    //TODO we should never ahve just one person in a conversation... so this hsould be refactored
    private removeFromConversationMap(socket: HalloWebSocket, state: conversationStore, conversationId: string) {
        state[conversationId] = state[conversationId].filter(s => s !== socket);
        if (state[conversationId].length === 0) {
            delete state[conversationId];
        }
        Object.assign(socket.halloState, {
            ...defaultHalloState
        });
    }

    removeUserFromConversation(socket: HalloWebSocket) {
        let conversationId = socket.halloState.conversationId;

        if (conversationId) {
            if (this.candidateConversations[conversationId]) {
                this.removeFromConversationMap(socket, this.candidateConversations, conversationId);
            } else if (this.conversations[conversationId]) {
                this.removeFromConversationMap(socket, this.conversations, conversationId);
            }
        }
    }
}