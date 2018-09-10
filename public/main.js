

class Socket {
    constructor(ws) {
        this.ws = ws;
        this.listeners = {}

        this.ws.onmessage = (message) => {
            const parsed = JSON.parse(message.data);
            if (parsed.type && this.listeners[parsed.type]) {
                this.listeners[parsed.type].forEach(fn => fn(parsed.payload));
            }
        }
    }

    emit(type, payload) {
        console.log('emitting', type, payload);
        ws.send(JSON.stringify({
            type,
            payload
        }));
    }

    on(type, fn) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(fn);
    }
}


const localVideoSelector = "#local-video";
const remoteVideoSelector = "#remote-video";
const leaveButtonSelector = "#leave-btn"
const joinButtonSelector = "#join-btn";
//https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling

//below is much more simple than above
//https://github.com/shanet/WebRTC-Example/blob/master/client/webrtc.js

const JOIN_CONVERSATION_QUEUE = 'JOIN_CONVERSATION_QUEUE';
const JOIN_CONVERSATION = 'JOIN_CONVERSATION';
const LEAVE_CONVERSATION = 'LEAVE_CONVERSATION';
const LEFT_CONVERSATION = 'LEFT_CONVERSATION';
const CONVERSATION_INFO = 'CONVERSATION_INFO';

const VIDEO_OFFER = 'VIDEO_OFFER';
const VIDEO_ANSWER = 'VIDEO_ANSWER' 
const NEW_ICE_CANDIDATE = 'NEW_ICE_CANDIDATE'
const HANG_UP = 'HANG_UP'
let localStream;
let remoteStream;
let localVideo = document.querySelector(localVideoSelector);
let remoteVideo = document.querySelector(remoteVideoSelector);
let joinButton = document.querySelector(joinButtonSelector)
let leaveButton = document.querySelector(leaveButtonSelector);
leaveButton.disabled = true;
joinButton.disabled = false;
let peerConnection;
const peerConnectionConfig = {
    iceServers: [     // Information about ICE servers - Use your own!
      {
        urls: "stun:stun.callwithus.com"
      }
    ]
};

async function getUserMedia() {
    if (!localStream) {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true})
        localStream = stream;
        localVideo.srcObject = stream;
        localVideo.autoplay = true;
        localVideo.play();
    }
    return localStream;
}


const prefix = window.location.protofol === 'https:' ? "wss://" : "ws://";
var ws = new WebSocket(prefix+window.location.host);
var socket = new Socket(ws);

async function startCall(isCaller) {
    console.log('isCaller', isCaller);
    localStream = await getUserMedia();
    peerConnection = new RTCPeerConnection(peerConnectionConfig);
    peerConnection.onicecandidate = gotIceCandidate;
    peerConnection.ontrack = gotRemoteStream;
    peerConnection.addStream(localStream);

    if (isCaller) {
        const description = await peerConnection.createOffer();
        createdDescription(description);
    }
    console.log('STARTING CALL', isCaller);
}

async function createdDescription(description) {
    console.log('got description');
    await peerConnection.setLocalDescription(description);
    socket.emit(CONVERSATION_INFO, {
        sdp: peerConnection.localDescription
    });
}

function gotRemoteStream(event) {
    updateStatus('connected');
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.autoplay = true;
    remoteVideo.play();
}

function gotIceCandidate(event) {
    if(event.candidate != null) {
        socket.emit(CONVERSATION_INFO, {
            ice: event.candidate
        });
    }
}

async function gotMessageFromServer(signal) {
    if (signal.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(
            signal.sdp
        ));
        if (signal.sdp.type === 'offer') {
            const description = await peerConnection.createAnswer();
            createdDescription(description);
        }
    } else if (signal.ice) {
        peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice));
    }
}

function endCall() {
    updateStatus('click find a conversation partner to start a conversation');
    let myPeerConnection = peerConnection;
    if (myPeerConnection) {
        myPeerConnection.ontrack = null;
        myPeerConnection.onremovetrack = null;
        myPeerConnection.onremovestream = null;
        myPeerConnection.onnicecandidate = null;
        myPeerConnection.oniceconnectionstatechange = null;
        myPeerConnection.onsignalingstatechange = null;
        myPeerConnection.onicegatheringstatechange = null;
        myPeerConnection.onnotificationneeded = null;
        myPeerConnection.close();
        myPeerConnection = null;
    }

    if (remoteVideo.srcObject) {
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        }
      
        if (localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
        }
    }

    // remoteVideo.removeAttribute("src");
    // remoteVideo.removeAttribute("srcObject");
    // localVideo.removeAttribute("src");
    // remoteVideo.removeAttribute("srcObject");
    joinButton.disabled = false;
    leaveButton.disabled = true;
}

joinButton.addEventListener('click', () => {
    if (!joinButton.disabled) {
        socket.emit(JOIN_CONVERSATION_QUEUE);
        updateStatus('looking for conversation partner');
        joinButton.disabled = true;
        leaveButton.disabled = false;
    }
});

leaveButton.addEventListener('click', () => {
    if (!leaveButton.disabled) {
        socket.emit(LEFT_CONVERSATION);
        endCall();
    }
})



async function main() {
    updateStatus('click find a conversation partner to match with someone online');
    socket.on(JOIN_CONVERSATION, ({isLeader}) => {
        updateStatus('connecting to partner');
        startCall(isLeader);
    });

    socket.on(LEAVE_CONVERSATION, () => {
        endCall();
        socket.emit(LEFT_CONVERSATION);
    });

    socket.on(CONVERSATION_INFO, gotMessageFromServer)
}

main();

function updateStatus(status) {
    document.querySelector('#status').innerHTML = status;
}

