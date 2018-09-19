import { AsyncEventEmitter } from "../utils/AsyncEventEmitter";
import { HalloSocket } from "./HalloSocket";
import {EventEmitter} from 'events';

export type EmitToRoomPayload = {
    event: string
    payload: any
    from: string
    to: string
}

export class RoomManager {
    _roomEmitter: EventEmitter = new EventEmitter();

    constructor() {
        //listen to pubsub, emitToRoom
    }

    on(room: string, handler: (payload: EmitToRoomPayload) => void) {
        this._roomEmitter.on(room, handler);
        return () => this._roomEmitter.removeListener(room, handler);
    }

    join(room: string, socket: HalloSocket) {
        let fn = (payload: EmitToRoomPayload) => {
            socket.emit(payload.event, payload.payload)
        };
        this._roomEmitter.on(room, fn);
        
        let offFn = () => {
            this._roomEmitter.removeListener(room, fn);
        };
        socket.registerOff(offFn);
        return offFn;
    }

    emitTo(room: string, payload: EmitToRoomPayload) {
        this._roomEmitter.emit(room, payload);
    }
}