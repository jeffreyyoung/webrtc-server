import { logger } from "../utils/logger";


export class QueueManager {
    private queue: string[] = [];

    onAdd: () => void = () => {};
    
    constructor() {
    }

    setOnAdd(fn: () => void) {
        this.onAdd = fn;
    }
    
    async addToFront(s: string) {
        this.queue.unshift(s);
        this.onAdd();
        
    }

    async addToQueue(s: string) {
        this.queue.push(s);
        logger.log('added to queue',this.getNumInQueue());
        this.onAdd();
    }

    //eventaully this will make a request over the network to redis
    //so this should be async
    async popFrontTwo(): Promise<string[] | undefined> {
        if (this.queue.length >= 2) {
            const convo = [this.queue[0], this.queue[1]];
            convo.forEach(s => this.removeFromQueue(s));
            return convo;
        }
    }

    async removeFromQueue(s: string) {
        let index = this.queue.indexOf(s);
        if (index === -1) {
        } else {
            this.queue.splice(index, 1);
        }
    }

    async getNumInQueue() {
        return this.queue.length;
    }
}