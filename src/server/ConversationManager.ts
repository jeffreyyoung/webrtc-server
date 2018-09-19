import * as WebSocket from 'ws';
import { getRandomId } from '../utils/randomId';


type conversationStore = {
    [conversationId: string]: string[] //contains userIds
}

//we can maybe get rid of this???

export class ConversationManager {
    static candidateConversationTimeout = 10;
    conversations: conversationStore = {};
    candidateConversations: conversationStore = {};

    getNumConversations() {
        return Object.keys(this.conversations).length;
    }

    getNumConversationCandidates() {
        return Object.keys(this.candidateConversations).length;
    }

    getConversation(conversationId: string): string[] {
        const cId = conversationId;
        if (cId && this.conversations[cId]) {
            return [...this.conversations[cId]];
        }

        return [];
    }

    putUsersInConversation(users: string[], conversationId: string) {
        this.conversations[conversationId] = [...users];
    }

    removeConversation(conversationId: string) {
        if(this.conversations[conversationId]) {
            delete this.conversations[conversationId];
        }
    }
}