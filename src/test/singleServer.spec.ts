import 'jest';
import { getServer } from '../server/getServer';
import { AsyncClient } from '../client/AsyncClient';
import { rejects } from 'assert';
import { getRandomId } from '../utils/randomId';
import { logger } from '../utils/logger';
import { socketEvents } from '../server/socketEvents';


const port = 4321;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('one server', () => {
    let server;
    let httpServerAddr;
    let defaultSocket: AsyncClient;
    beforeAll(async () => {
        httpServerAddr = await getServer();
    });

    afterAll(() => {
        server.close();
    });

    beforeEach(async () => {
        defaultSocket = await getSocket();
    });

    afterEach(async () => {
        await defaultSocket && defaultSocket.disconnect();
    });

    async function getSocket() {
        let a = new AsyncClient(`ws://${httpServerAddr.address}:${httpServerAddr.port}`);
        await a.connect();
        return a;
    }

    async function getEagerSocket(): Promise<{conversationId: string}> {
        let person = await getSocket();

        await person.emitAndAwait(socketEvents.authenticate, {userId: getRandomId()});

        person.once(socketEvents.conversationCandidate, (payload) => {
            person.emit(socketEvents.acceptCandidate, payload);
        });

        let onConversation = person.onceAsync(socketEvents.joinedConveration);
        let joinedQueue = await person.emitAndAwait(socketEvents.joinQueue, {});
        let result = await onConversation;
        await person.disconnect();
        return result;
    }

    class EagerSocket {
        socket: AsyncClient;
        constructor() {
            this.socket = new AsyncClient(`ws://${httpServerAddr.address}:${httpServerAddr.port}`);
        }

        async start() {
            await this.socket.connect();
            let s = this.socket;
            s.once(socketEvents.conversationCandidate, (payload) => {
                s.emit(socketEvents.acceptCandidate, payload);
            });
    
            let onConversation = s.onceAsync(socketEvents.joinedConveration);
            let joinedQueue = await s.emitAndAwait(socketEvents.joinQueue, {});
            let result = await onConversation;
        }
    }

    test('should be able to connect to socket and echo', async () => {
        let payload = {yay: 'meow'};
        let res = await defaultSocket.emitAndAwait(socketEvents.echo, payload);
        expect(res).toEqual(payload);
    });

    describe(socketEvents.joinQueue, async () => {
        let s;
        beforeAll(async () => {
            s = await getSocket();
        })
        afterAll(async () => {
            await s.disconnect();
        })
        test('should not be able to join-queue without authenticating', async () => {
            let res = await s.emitAndAwait(socketEvents.joinQueue);
            expect(res).toEqual({didJoinQueue: false});
            let res1 = await s.emitAndAwait(socketEvents.authenticate, {userId: 'yay'});
            expect(res1).toEqual({userId: 'yay'});
            let res3 = await s.emitAndAwait(socketEvents.joinQueue);
            expect(res3).toEqual({didJoinQueue: true});
        },1000);
    
        test('should be able to leave queue', async () => {
            let res1 = await s.emitAndAwait(socketEvents.queueSize);
            expect(res1).toEqual({queueSize: 1});
            await s.emitAndAwait(socketEvents.leaveQueue);
            let res2 = await s.emitAndAwait(socketEvents.queueSize);
            expect(res2).toEqual({queueSize: 0});
        });
        
        test('should leave queue after unauthenticating', async () => {
            //TODO
        });

        test('should leave queue after disconnecting for x seconds', async () => {
            //TODO: for now we'll just leave the person in the queue
            await s.disconnect();
        });
    
        test('should not leave queue after leaving and reconnecting within x seconds', async () => {
            //TODO
        });
    });

    describe('match making', () => {
        async function eagerPerson() {
            let s = await getSocket();
            await s.emitAndAwait(socketEvents.authenticate, {userId: ''+getRandomId()});
            s.on(socketEvents.conversationCandidate, async (args) => {
                const {conversationId} = await s.emitAndAwait(socketEvents.acceptCandidate,args);
            });

            let getConversatonId = s.onceAsync('join')
            await s.emitAndAwait(socketEvents.joinQueue);
            
        }

        test('happy path should work', async () => {
            let person1 = await getSocket();
            let person2 = await getSocket();

            await person1.emitAndAwait(socketEvents.authenticate, {userId: '1'});
            await person2.emitAndAwait(socketEvents.authenticate, {userId: '2'});

            //once they get a candidate accept
            person1.once(socketEvents.conversationCandidate, (payload) => {
                person1.emit(socketEvents.acceptCandidate, payload);
            });
            person2.once(socketEvents.conversationCandidate, (payload) => {
                person2.emit(socketEvents.acceptCandidate, payload);
            });

            let onConversation1 = person1.onceAsync(socketEvents.joinedConveration);
            let onConversation2 = person2.onceAsync(socketEvents.joinedConveration);

            person1.emit(socketEvents.joinQueue, {});
            person2.emit(socketEvents.joinQueue, {});

            let results = await Promise.all([onConversation1, onConversation2]);
            let {queueSize} = await defaultSocket.emitAndAwait(socketEvents.queueSize, {});
            expect(queueSize).toBe(0);
            expect(results[0].conversationId).toBe(results[1].conversationId);
            await Promise.all([person1.disconnect(), person2.disconnect()]);
        });

        test('100 users should find matches in under 5 seconds', async () => {
            let results = await Promise.all(
                Array(300).fill(null).map(() => getEagerSocket())
            );
            let conversationCounts = {};
            results.forEach(res => {
                if (!conversationCounts[res.conversationId]) {
                    conversationCounts[res.conversationId] = 0;
                }
                conversationCounts[res.conversationId] = conversationCounts[res.conversationId] + 1;
            });
            validateConversationCounts(conversationCounts, 150);
        }, 7500);

        test('should handle 3 users', async () => {
            //TODO fix this test
            let users = Array(3).fill(null).map(meh => new EagerSocket());
            let promises = users.map(u => u.start());

            let results = await Promise.all([promises[0], promises[1]]);
            validateResults(results);


        });
    });
});

function validateResults(results) {
    let conversationCounts = {};
    results.forEach(res => {
        if (!conversationCounts[res.conversationId]) {
            conversationCounts[res.conversationId] = 0;
        }
        conversationCounts[res.conversationId] = conversationCounts[res.conversationId] + 1;
    });
    validateConversationCounts(conversationCounts, 2);
}

function validateConversationCounts(conversationCounts: {[conversationId: string]: number}, expectedNumConversations: number) {
    let totalConversations = Object.keys(conversationCounts).length;
    let areAllConversationsOfSizeZero = Object.keys(conversationCounts)
        .map(key => conversationCounts[key])
        .every(count => count === 2);
    expect(areAllConversationsOfSizeZero).toBe(true);
    expect(totalConversations).toBe(expectedNumConversations);
}