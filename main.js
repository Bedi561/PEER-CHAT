// Importing Agora RTM SDK
// import AgoraRTM from 'agora-rtm-sdk'
const APP_ID = "aefbcec9835a40db9cb2a8bd256e64ea"

let token = null; // Because we are just using appId initially
let uid = String(Math.floor(Math.random() * 10000));

let client;
let channel;

let queryString = window.location.search;
let urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get('room');

if (!roomId) {
    console.log('Room ID not found. Redirecting to lobby.');
    window.location = 'lobby.html';
}

let localStream; // Local video and audio
let remoteStream; // Remote user's stream
let peerConnection;
let userPool = [];

// STUN server configuration
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
};

let init = async () => {
    console.log('Initializing Agora RTM client...');
    client = await AgoraRTM.createInstance(APP_ID);
    console.log('Logging in with UID:', uid);
    await client.login({ uid, token });

    console.log('Joining channel:', roomId);
    channel = client.createChannel(roomId);
    await channel.join();

    channel.on('MemberJoined', handleUserJoined);
    channel.on('MemberLeft', handleUserLeft);

    client.on('MessageFromPeer', handleMessageFromPeer);

    try {
        console.log('Accessing local media devices...');
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log('Local stream initialized:', localStream);
        document.getElementById('user-1').srcObject = localStream;
    } catch (error) {
        console.error('Error accessing media devices:', error);
    }
};

let handleUserLeft = (MemberId) => {
    console.log('User left:', MemberId);
    document.getElementById('user-2').style.display = 'none';

    userPool = userPool.filter(user => user !== MemberId);

    // Check if there are users left in the pool
    if (userPool.length > 0) {
        let nextUser = userPool.shift();
        console.log('Attempting to create offer for next user:', nextUser);
        createOffer(nextUser);
    } else {
        console.log('No users left in the pool.');
    }
};

let handleMessageFromPeer = async (message, MemberId) => {
    console.log('Received message from peer:', message, 'Member ID:', MemberId);
    message = JSON.parse(message.text);
    console.log('Parsed message:', message);
    
    if (message.type === 'offer') {
        console.log('Received offer, creating answer...');
        createAnswer(MemberId, message.offer);
    } 
    if (message.type === 'answer') {
        console.log('Received answer, adding answer...');
        addAnswer(message.answer);
    } 
    if (message.type === 'candidate') {
        console.log('Received ICE candidate:', message.candidate);
        if (peerConnection) {
            peerConnection.addIceCandidate(message.candidate);
        }
    }
};

let handleUserJoined = async (MemberId) => {
    console.log('A new user has joined the channel:', MemberId);
    createOffer(MemberId); // Create offer for the new user
    userPool.push(MemberId);
    console.log('User pool:', userPool);

    // Check if there's an existing user to pair with
    if (userPool.length > 1) {
        let pairedUser = userPool.shift(); // Select the next user from the pool
        console.log('Pairing with user:', pairedUser);
        createOffer(pairedUser);
    }
};

let createPeerConnection = async (MemberId) => {
    console.log('Creating peer connection for Member:', MemberId);
    peerConnection = new RTCPeerConnection(servers);

    remoteStream = new MediaStream();
    document.getElementById('user-2').srcObject = remoteStream;
    document.getElementById('user-2').style.display = 'block';

    if (!localStream) {
        console.log('Local stream not found, creating new stream...');
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        console.log('New local stream created:', localStream);
        document.getElementById('user-1').srcObject = localStream;
    }

    // Add local tracks to the peer connection
    localStream.getTracks().forEach((track) => {
        console.log('Adding local track:', track);
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track);
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
    };

    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate to peer:', event.candidate);
            client.sendMessageToPeer({ text: JSON.stringify({ type: 'candidate', candidate: event.candidate }) }, MemberId);
        }
    };
};

let createOffer = async (MemberId) => {
    console.log('Creating offer for Member:', MemberId);
    await createPeerConnection(MemberId);

    let offer = await peerConnection.createOffer();
    console.log('Offer created:', offer);
    await peerConnection.setLocalDescription(offer);

    console.log('Sending offer to peer:', offer);
    client.sendMessageToPeer({ text: JSON.stringify({ type: 'offer', offer: offer }) }, MemberId);
};

let createAnswer = async (MemberId, offer) => {
    console.log('Creating answer for Member:', MemberId);
    await createPeerConnection(MemberId);
    await peerConnection.setRemoteDescription(offer);

    let answer = await peerConnection.createAnswer();
    console.log('Answer created:', answer);
    await peerConnection.setLocalDescription(answer);

    console.log('Sending answer to peer:', answer);
    client.sendMessageToPeer({ text: JSON.stringify({ type: 'answer', answer: answer }) }, MemberId);
};

let addAnswer = async (answer) => {
    if (!peerConnection.currentRemoteDescription) {
        console.log('Setting remote description with answer:', answer);
        peerConnection.setRemoteDescription(answer);
    }
};

let leaveChannel = async () => {
    console.log('Leaving channel...');
    await channel.leave();
    await client.logout();
};

let toggleCamera = async () => {
    let videoTrack = localStream.getTracks().find(track => track.kind === 'video');
    if (videoTrack.enabled) {
        console.log('Disabling video...');
        videoTrack.enabled = false;
        document.getElementById('camera').style.backgroundColor = 'rgb(255,80,80)';
    } else {
        console.log('Enabling video...');
        videoTrack.enabled = true;
        document.getElementById('camera').style.backgroundColor = 'rgb(179,80,80)';
    }
};

let toggleMic = async () => {
    let audioTrack = localStream.getTracks().find(track => track.kind === 'audio');
    if (audioTrack.enabled) {
        console.log('Disabling audio...');
        audioTrack.enabled = false;
        document.getElementById('mute').style.backgroundColor = 'rgb(255,80,80)';
    } else {
        console.log('Enabling audio...');
        audioTrack.enabled = true;
        document.getElementById('mute').style.backgroundColor = 'rgb(179,80,80)';
    }
};

window.addEventListener('beforeunload', leaveChannel);
document.getElementById('camera').addEventListener('click', toggleCamera);
document.getElementById('mute').addEventListener('click', toggleMic);
document.getElementById('leave').addEventListener('click', leaveChannel);

init();
