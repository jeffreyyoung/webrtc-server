import {EventEmitter} from 'events';


export class AsyncEventEmitter extends EventEmitter {
    async asyncOnce(event): Promise<any> {
        return new Promise(resolve => {
            this.once(event, (...args) => {
                resolve(...args);
            });
        });
    }
}