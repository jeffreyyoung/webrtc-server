import { getRandomId } from "./randomId";
import { AsyncClient } from "./AsyncClient";


const batch_size = 3;
const interval_size = 2000;

async function getSocket() {
    let a = new AsyncClient(`http://localhost:4321`);
    await a.connect();
    return a;
}

async function getEagerSocket(userId? : string):Promise<{event: string, payload: any, socket: AsyncClient}> {
    let s = await getSocket();

    //authenticate
    s.emitAndAwait('authenticate', {
        userId: userId || getRandomId()
    });

    //catch success events
    let onConversationCandidate = s.onceAsync('conversation-candidate-found')
    let onDecision = s.onceManyAsync('joined-conversation', 'candidate-canceled');

    //join the queue
    let joinedQueue = await s.emitAndAwait('join-queue');

    //found a candidate
    await onConversationCandidate;

    //tell them we accept the candidate
    let res = await s.emitAndAwait('accept-conversation-candidate');
    let [event, payload] = await onDecision;
    //return the result
    return {
        event,
        payload,
        socket: s
    };
}

let numProcessed = 0;

//setInterval(async () => {
async function main() {
    try {
        console.log('starting batch');
        const results = await Promise.all(Array(batch_size).fill(1).map(i => getEagerSocket()));
        console.log('got results');
        console.log(results.map(r => ++numProcessed && r.event));
        await Promise.all(results.map(r => r.socket.disconnect()));
        console.log('all disconnected, numProcessed: ', numProcessed);
    } catch(e) {
        console.log('error?', e);
    }
}
//}, interval_size)