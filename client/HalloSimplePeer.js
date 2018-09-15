const HalloEventEmitter = require('./HalloEventEmitter');

const PUBLIC_EVENTS = {
    incomingSignal: 'incomingSignal',
    outgoingSignal: 'outgoingSignal',
    stream: 'stream',
}

const PRIVATE_EVENTS ={
    offer: 'offer', //includes sdp
    answer: 'answer', //includes sdp
    candidate: 'candidate', //{candidate, sdpMLineIndex, sdpMid}
}

module.exports = class HalloPeer extends HalloEventEmitter {
    constructor({initiator, stream}) {
        super();
        this.initiator = initiator || false;
        this.streams = [stream];
        this.config = {
            iceServers: [
            {
                urls: 'stun:stun.l.google.com:19302'
            },
            {
                urls: 'stun:global.stun.twilio.com:3478?transport=udp'
            }
            ]
        };
        this._pendingCandidates = [];
        this.constraints = {};
        this._pc = new RTCPeerConnection(this.config, this.constraints);
        this._isNegotiating = !this.initiator;
        this._pc.oniceconnectionstatechange = this._onIceStateChange.bind(this);
        this._pc.onicegatheringstatechange = this._onIceStateChange.bind(this);
        this._pc.onsignalingstatechange = this._onSignalingStateChange.bind(this);
        this._pc.onicecandidate = this._onIceCandidate.bind(this);
        this._remoteStreams = [];
        this._remoteTracks = [];
        this._senderMap = new Map();
        this.destroyed = false;
        if ('addTrack' in this._pc) {
            if (this.streams) {
                this.streams.forEach(stream => this.addStream(stream))
            }
            this._pc.ontrack = this._onTrack.bind(this);
        }
        this.on(PUBLIC_EVENTS.incomingSignal, this._handleIncomingSignal.bind(this));
        if (this.initiator) {
            this._needsNegotiation();
        }
    }

    disableAudio() {
        this._pc.getLocalStreams().forEach(stream => {
            stream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
        });
    }

    disableVideo() {
        this._pc.getLocalStreams().forEach(stream => {
            stream.getVideoTracks().forEach(track => {
                track.enabled = false;
            });
        });
    }

    enableAudio() {
        this.streams.forEach(stream => {
            stream.getAudioTracks().forEach(track => {
                track.enabled = true;
            });
        });
    }

    enableVideo() {
        this.streams.forEach(stream => {
            stream.getVideoTracks().forEach(track => {
                track.enabled = true;
            });
        });
    }

    _onIceStateChange() {

    }

    _onSignalingStateChange() {
        if (this.destroyed) {return;}
        if (this._pc.signalingState === 'stable') {
            this._isNegotiating = false;

            //add _sendersAwaitingStable
            if (this._queuedNegotiation) {
                this._queuedNegotiation = false;
                this._needsNegotiation();
            }
        }
    }

    _onTrack(event) {
        if (this.destroyed) { return; }
        event.streams.forEach(eventStream => {
            this.emit('track', event.track, eventStream);

            this._remoteTracks.push({
                track: event.track,
                stream: eventStream
            });
            if (this._remoteStreams.some(remoteStream => remoteStream.id === eventStream.id)) {
                return;
            }

            this._remoteStreams.push(eventStream);
            setTimeout(() => this.emit('stream', eventStream));
        });
    }

    addStream(stream) {
        stream.getTracks().forEach(track => this.addTrack(track, stream));
    }

    addTrack(track, stream) {
        log('adding track', track);
        //TODO this might not be right
        var sender = this._pc.addTrack(track, stream);
        var submap = this._senderMap.get(track) || new WeakMap();
        submap.set(stream, sender);
        this._senderMap.set(track, submap);
        this._needsNegotiation();
    }

    //implement negotiation things

    _onIceCandidate(event) {
        if (event.candidate) {
            this.sendSignal({
                candidate: {
                    candidate: event.candidate.candidate,
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    sdpMid: event.candidate.sdpMid
                }
            });
        }
    }

    async _createOffer() {
        if (this.destroyed) {return;}
        const offer = await this._pc.createOffer();
        if (this.destroyed) {return;}
        await this._pc.setLocalDescription(offer);
        this.sendSignal({
            type: this._pc.localDescription.type,
            sdp: this._pc.localDescription.sdp
        });
    }

    _addIceCandidate(candidate) {
        this._pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    async _handleIncomingSignal(data) {
        if (data.candidate) {
            if (this._pc.remoteDescription && this._pc.remoteDescription.type) {
                this._addIceCandidate(data.candidate);
            } else {
                this._pendingCandidates.push(data.candidate);
            }
        }
        if (data.sdp) {
            const res = await this._pc.setRemoteDescription(new RTCSessionDescription(data));
            if (this._pc.remoteDescription.type === PRIVATE_EVENTS.offer) {
                this._createAnswer();
            }
        }
        if (data.renegotiate) {
            log('got request to renogtiate');
            this._needsNegotiation()
        }
    }

    _needsNegotiation() {
        if (this._batchedNegotiation) {return;}
        this._batchedNegotiation = true;
        setTimeout(() => {
            this._batchedNegotiation = false;
            this.negotiate();
        }, 0);
    }

    negotiate() {
        if (this.initiator) {
            if (this._isNegotiating) {
                this._queuedNegotiation = true;
            } else {
                this._createOffer();
            }
        } else {
            if (!this._isNegotiating) {
                this.sendSignal({
                    renegotiate: true
                });
            }
        }
        this._isNegotiating = true;
    }

    async _createAnswer() {
        if (this.destroyed) { return; }
        let answer = await this._pc.createAnswer();
        if (this.destroyed) {return;}
        await this._pc.setLocalDescription(answer);
        if (this.destroyed) {return;}
        var signal = this._pc.localDescription ;
        this.sendSignal({
            type: signal.type,
            sdp: signal.sdp
        });
    }

    sendSignal(payload) {
        log('SENDING SIGNAL', payload);
        this.emit('signal', payload);
    }

    signal(payload) {
        log('SIGNALING', payload);
        this.emit(PUBLIC_EVENTS.incomingSignal, payload);
    }

    removeTrack(track, stream) {
        var submap = this._senderMap.get(track);
        var sender = submap ? submap.get(stream) : null;
        log('GETTING SENDER???');
        if (!sender) {
            throw 'gahhhhh';
        }
        try {
            this._pc.removeTrack(sender);
        } catch (err) {
            console.error(err);
        }
    }

    removeStream(stream) {
        stream.getTracks().forEach(track => this.removeTrack(track, stream));
    }

    destroy() {
        if (this.destroyed) { return; }
        this.readable = false;
        this.writable = false;

        if (this._pc) {
            this._pc.close();
        }
        this.emit('destroy');
        this.emit('close');
    }
}



