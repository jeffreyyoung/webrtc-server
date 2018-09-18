import 'jest';
import { getServer } from '../Server';
import io from 'socket.io-client';
import { AsyncClient } from '../AsyncClient';
import { rejects } from 'assert';
import { defaultHalloState } from '../ConversationsManager';
import { getRandomId } from '../randomId';
import { logger } from '../logger';

//https://jestjs.io/docs/en/configuration.html

const port = 1111;

const defaultState = {
    userId: '',
    isInCandidate: false,
    isInConversation: false,
    conversationId: '',
    isInQueue: false,
    hasAcceptedCandidate: false
};

describe('test server', () => {
    let server;
    let httpServerAddr;
    let socket: AsyncClient;
    async function getSocket() {
        let a = new AsyncClient(`http://[${httpServerAddr.address}]:${httpServerAddr.port}`);
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
        let onConversationCandidate = s.onceAsync('conversation-candidate-found', false)
        let onDecision = s.onceManyAsync('joined-conversation', 'candidate-canceled');

        //join the queue
        let joinedQueue = await s.emitAndAwait('join-queue');

        //found a candidate
        await onConversationCandidate;
        let res = await s.emitAndAwait('accept-conversation-candidate', {}, false);
        let [event, payload] = await onDecision;
        //return the result
        return {
            event,
            payload,
            socket: s
        };
            
        //tell them we accept the candidate
    }

    //setup the server before running these tests
    beforeAll((done) => {
        //setup the server
        server = getServer();
        let s = server.listen(port, '0.0.0.0', () => {
            httpServerAddr = s.address();
            done();
        })
    });

    //create a default socket to be used before each test
    beforeEach(async () => {
        socket = await getSocket();
    });

    //close the default socket
    afterEach(async () => {
        logger.log('after each!');
        await socket.disconnect();
    });

    it('should be able to connect', async () => {
        //ensure we can connect to the server and disconnect
        let s = await getSocket();
        expect(true).toBe(true);
        await s.disconnect();
    });

    it('should be able to emit events', async () => {
        //ensure that the server is processing events and returning them
        let sent = {meow: 'yar'};
        socket.emit('echo', sent);
        const response = await socket.onceAsync('echo');
        expect(sent).toEqual(response);
    });

    it('authenticate should work', async () => {
        //ensure user-info and authenticate events work
        const info = await socket.emitAndAwait('user-info');
        expect(info).toEqual({...defaultState});
        
        socket.emit('authenticate', {userId: 'meow'});
        const info2 = await socket.emitAndAwait('user-info');
        expect(info2).toEqual({
            ...defaultState,
            userId: 'meow',
        });
    });

    it('queue-size should work', async () => {
        //ensure the queue size changes
        expect(
            await socket.emitAndAwait('queue-size')
        ).toEqual({queueSize: 0});

        socket.emit('join-queue');

        expect(
            await socket.emitAndAwait('queue-size')
        ).toEqual({queueSize: 1});

        await socket.emitAndAwait('leave-queue');
    });

    it('disconnected users should be removed from queue', async () => {
        let s = await getSocket();

        expect(await s.emitAndAwait('queue-size'))
            .toEqual({queueSize: 0});

        s.emit('join-queue');
        logger.log('here');
        expect(await s.emitAndAwait('queue-size'))
        .toEqual({queueSize: 1});

        await s.disconnect();

        //user other socket to check whether the queue is full
        expect(await socket.emitAndAwait('queue-size'))
            .toEqual({queueSize: 0});
    });

    it('once the queue is large enough, users should be invited to a conversation', async () => {
        let sockets = await Promise.all([
            getSocket(),
            getSocket(),
            getSocket()
        ]);
        let [s1,s2,s3] = sockets;

        //make each socket authenticate
        await Promise.all(sockets.map((s,index) => s.emitAndAwait(
            'authenticate',
            {
                userId: `user${index}`
            }
        )));

        //make sure all the users authenticated properly
        await Promise.all(sockets.map(async (s,index) => {
            const {userId} = await s.emitAndAwait('user-info');
            expect(userId).toEqual(`user${index}`);
        }));

        //setup the join conversation listeners to ensure we catch the event
        let candidateFoundPromises = sockets.slice(0, sockets.length - 1).map(s => s.onceAsync('conversation-candidate-found'));

        await Promise.all(
            sockets.map(s => s.emitAndAwait('join-queue'))
        );
 
        //there should only be one person in the queue at this moment
        expect(await socket.emitAndAwait('queue-size')).toEqual({queueSize: 1});

        await Promise.all(candidateFoundPromises);
        let socketStates = await Promise.all(
            sockets.map(async (s) => s.emitAndAwait('user-info'))
        );

        socketStates.forEach((state, i) => {
            if (i < 2) { //two users should be in a candidate conversation
                expect(state).toEqual({
                    ...defaultState,
                    userId: `user${i}`,
                    isInCandidate: true,
                    isInQueue: false,
                    conversationId: socketStates[0].conversationId
                });
            } else { //one user should still be in the queue
                expect(state).toEqual({
                    ...defaultState,
                    isInQueue: true,
                    userId: `user${i}`,
                });
            }
        });
        
        const inCandidateSockets = [s1, s2];

        await Promise.all(inCandidateSockets.map(async (s, index) => {
            let joined = s.onceAsync('joined-conversation');
            expect(
                await s.emitAndAwait('accept-conversation-candidate')
            ).toEqual({
                ...defaultState,
                userId: `user${index}`,
                isInCandidate: true,
                isInQueue: false,
                conversationId: socketStates[0].conversationId,
                hasAcceptedCandidate: true
            });
            //peak at conversation id just to make test easier
            let joinedState = await joined;
            expect(
                joinedState
            ).toEqual({
                ...defaultState,
                userId: `user${index}`,
                conversationId: joinedState.conversationId,
                isInConversation: true
            });
        }));

        expect(
            await socket.emitAndAwait('queue-size')
        ).toEqual({queueSize: 1});

        logger.log('states', await Promise.all(
            [s1,s2,s3].map(s => s.emitAndAwait('user-info'))
        ));

        let p1 = s1.onceAsync('leave-conversation');
        let p2 = s2.emitAndAwait('leave-conversation');
        let results = await Promise.all([p1,p2]);
        results.forEach((r, index) => {
            expect(r).toEqual({
                ...defaultState,
                userId: r.userId
            });
        });
        await s3.emitAndAwait('leave-queue');
        expect(await socket.emitAndAwait('queue-size')).toEqual({queueSize: 0});

        await Promise.all([s1,s2,s3].map(s => s.disconnect()));
    });

    it('two eager clients should connect', async () => {
        let results = await Promise.all([
            getEagerSocket(),
            getEagerSocket()
        ]);

        results.forEach(async ({event, payload, socket}) => {
            expect(event).toBe('joined-conversation');
            expect(payload)
                .toEqual({
                    ...defaultHalloState,
                    isInConversation: true,
                    userId: payload.userId,
                    conversationId: payload.conversationId
                });
        });

        await Promise.all(results.map(({socket}) => socket.disconnect()));
    });

    it('one eager client, and one disconnected client should not connect', async () => {
        const eager = getEagerSocket();
        await socket.emitAndAwait('authenticate', {userId: 'dudewithbadinternet'});
        const onCandidate = socket.onceAsync('conversation-candidate-found')

        let onCanceled = socket.onceAsync('candidate-canceled');
        await socket.emitAndAwait('join-queue');

        await onCandidate;
        
        //10 seconds will pass and "socket" isn't going 
        //to accept the conversation candidate
        
        let eagerResult = await eager;
        let canceldResult = await onCanceled;

        expect(eagerResult.payload)
            .toEqual({
                ...defaultState,
                userId: eagerResult.payload.userId,
                isInQueue: true
            });
        expect(eagerResult.event).toBe('candidate-canceled');

        expect(canceldResult)
            .toEqual({
                ...defaultState,
                userId: canceldResult.userId
            });

        expect(await socket.emitAndAwait('queue-size'))
            .toEqual({queueSize: 1});
        await eagerResult.socket.disconnect();
        expect(await socket.emitAndAwait('queue-size'))
            .toEqual({queueSize: 0});
    },7000);

    it('should handle load', async () => {
        const numEagers = 100;
        const eager = await Promise.all(Array(numEagers).fill(null).map(i => getEagerSocket()));
        wait(1000);
        let stats = await socket.emitAndAwait('server-stats');
        expect(stats)
            .toEqual({
                queueSize: 0,
                numConversations: numEagers/2,
                numCandidateConversations: 0
            });

        await Promise.all(
            eager.map(f => f.socket.emitAndAwait('leave-conversation'))
        );

        wait(1000);

        let stats1 = await socket.emitAndAwait('server-stats');
        expect(stats1)
            .toEqual({
                queueSize: 0,
                numConversations: 0,
                numCandidateConversations: 0
            });
        
        await Promise.all(
            eager.map(f => f.socket.disconnect())
        );
    }, 150000);

    it('should handle odd number of eager clients', async () => {
        const eagers = Array(3).fill(null).map(i => getEagerSocket());

        await Promise.all(eagers.slice(0,1));

        let stats = await socket.emitAndAwait('server-stats');

        expect(stats)
            .toEqual({
                queueSize: 1,
                numConversations: 1,
                numCandidateConversations: 0
            });

        await getEagerSocket();
        let stats1 = await socket.emitAndAwait('server-stats');

        expect(stats1)
            .toEqual({
                queueSize: 0,
                numConversations: 2,
                numCandidateConversations: 0
            });

    },20000);

    afterAll(() => {
        logger.log('closing server');
        server.close();
    });
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

process.on('unhandledRejection', async (reason, p) => {
    console.trace('Unhandled Rejection at:', p, 'reason:', reason);
    try {
        let j = await p;
        console.log('here is j: ', j);
    } catch (e) {
        console.log('promise rejected', e);
    }
    
    
    // application specific logging, throwing an error, or other logic here
 });