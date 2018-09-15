

var CallFinder = require('./CallFinder');

const cf = new CallFinder();
cf.on('stream', ({localStream, remoteStream}) => {
  log('GOT THE STREAM!?!?!?');

    var video1 = document.querySelector('#video1');
    video1.src = window.URL.createObjectURL(localStream);
    video1.play();  
    var video = document.querySelector('#video2');
    video.src = window.URL.createObjectURL(remoteStream)
    video.play()
});
log("here???");
// var Peer = require('./HalloSimplePeer');
// //var Peer = require('simple-peer');

// // get video/voice stream
// navigator.getUserMedia({ video: true, audio: true }, gotMedia, function () {})

// function gotMedia (localStream) {
//     window.stream = localStream;
//   var peer1 = new Peer({ initiator: true, stream: localStream })
//   var peer2 = new Peer({stream: localStream});
//     window.peer1 = peer1;
//     window.peer2 = peer2;

//   peer1.on('signal', function (data) {
//       log('peer1 signal', data)
//     peer2.signal(data)
//   })

//   peer1.on('stream', stream => {
//       log('peer1 stream', stream);
//   })

//   peer2.on('signal', function (data) {
//     log('peer2 signal', data)
//     peer1.signal(data)
//   })

//   peer2.on('stream', function (stream) {
//     log('peer2 stream', stream)
//     // var video1 = document.querySelector('#video1');
//     // video1.src = window.URL.createObjectURL(localStream);
//     // video1.play();  
//     // got remote video stream, now let's show it in a video tag
//     var video = document.querySelector('#video2');
//     video.src = window.URL.createObjectURL(stream)
//     video.play()
//   })
// }