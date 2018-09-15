import { HalloWebSocket } from "./ConversationsManager";

export class QueueManager {
    private queue: HalloWebSocket[] = [];
    onAdd: () => void;
    
    constructor(onAdd: () => void) {
        this.onAdd = onAdd;
    }
    
    addToFront(s: HalloWebSocket) {
        s.halloState.isInQueue = true;
        this.queue.unshift(s);
        this.onAdd();
    }

    addToQueue(s: HalloWebSocket) {
        s.halloState.isInQueue = true;
        this.queue.push(s);
        console.log('added to queue',this.getNumInQueue());
        this.onAdd();
    }

    //eventaully this will make a request over the network to redis
    //so this should be async
    async popFrontTwo(): Promise<HalloWebSocket[] | undefined> {
        if (this.queue.length >= 2) {
            const convo = [this.queue[0], this.queue[1]];
            convo.forEach(s => this.removeFromQueue(s));
            return convo;
        }
    }

    removeFromQueue(s: HalloWebSocket) {
        if (s.halloState.isInQueue) {
            let index = this.queue.indexOf(s);
            if (index === -1) {
            } else {
                s.halloState.isInQueue = false;
                this.queue.splice(index, 1);
            }
        }
    }

    getNumInQueue() {
        return this.queue.length;
    }
}