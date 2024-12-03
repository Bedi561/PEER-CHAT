// import  AgoraRTM from 'agora-rtm-sdk'
const APP_ID = "aefbcec9835a40db9cb2a8bd256e64ea"


let token = null; //cuz abhi sirf app id sehi karenge 
let uid = String(Math.floor(Math.random() * 10000))



let client;
let channel;


let queryString = window.location.search
let urlParams = new URLSearchParams(queryString)
let roomId = urlParams.get('room')

if (!roomId) {
    window.location = 'lobby.html'
}



let localStream; // this my audio and video data variable
let remoteStream; // this is of other users 
let peerConnection;
let userPool = [];

// just copying stuff in here 
const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        }
    ]
}// now we will just pass this onto our rtc peer connection 


let init = async () => {
    client = await AgoraRTM.createInstance(APP_ID)
    await client.login({ uid, token })

    channel = client.createChannel(roomId)
    await channel.join()

    // now we would like to send a msg to any1 that joins the channel 
    channel.on('MemberJoined', handleUserJoined)
    channel.on('MemberLeft', handleUserLeft)

    client.on('MessageFromPeer', handleMessageFromPeer)

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    document.getElementById('user-1').srcObject = localStream


}


/* 
1. the first thing when the page reloads we want to happen is to ask for video permission
2. The async keyword is used to indicate that this function contains asynchronous code that may involve waiting for some operations to complete.
3. This line is where the magic happens. It uses the navigator.mediaDevices.getUserMedia method to access the user's camera and microphone
The await keyword is used here to wait for the browser to complete this operation before moving on. When it's done, the result is stored in a variable called localStream.
4. document.getElementById('user-1'):

This part is like telling the web page to look for something with the ID "user-1" in the HTML code. When it finds it, it's like pointing at that specific part of the page.

.srcObject = localStream:
Once it has found the "user-1" part, it sets a property called srcObject of that part to localStream.
Think of it like telling the web page, "Hey, the video from the user's camera should be shown here in 'user-1'."
*/

let handleUserLeft = (MemberId) => {
    document.getElementById('user-2').style.display = 'none';



    userPool = userPool.filter(user => user !== MemberId);

    // Check if there are users left in the pool
    if (userPool.length > 0) {
        // Select the next user from the pool and create a new connection
        let nextUser = userPool.shift();
        createOffer(nextUser);
    } else {
        // No users left in the pool, handle accordingly (e.g., display a waiting message)
        console.log('No users left in the pool.');
    }


}

let handleMessageFromPeer = async (message, MemberId) => {
    message = JSON.parse(message.text)
    console.log('Message:', message)
    if (message.type === 'offer') {
        createAnswer(MemberId, message.offer)
    }
    if (message.type === 'answer') {
        addAnswer(message.answer)
    }
    if (message.type === 'candidate') {
        if (peerConnection) {
            peerConnection.addIceCandidate(message.candidate)
        }
    }
}

let handleUserJoined = async (MemberId) => {
    console.log('A new user has joined the channel')
    createOffer(MemberId);// its called here as we would want the user joined to get the sdp offer


    console.log('A new user has joined the channel');

    // Add the new user to the pool
    userPool.push(MemberId);

    // Check if there's an existing user to pair with
    if (userPool.length > 1) {
        let pairedUser = userPool.shift(); // Select the next user from the pool
        createOffer(pairedUser);
    }
}


let createPeerConnnection = async (MemberId) => {
    peerConnection = new RTCPeerConnection(servers)

    remoteStream = new MediaStream()
    document.getElementById('user-2').srcObject = remoteStream
    document.getElementById('user-2').style.display = 'block'

    // adding in a check ie if in case we dont have a localstream we create 1 
    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        document.getElementById('user-1').srcObject = localStream
    }

    // now we will try to add all the tracks in the local stream of the peer connection
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
    })
    // localStream is an object representing your local audio and video streams, which you want to send to the other person in the call.
    // getTracks() is a method that retrieves all the individual audio and video tracks from the localStream. Each track represents either your audio or video stream.
    // this code adds the track to the peerConnection. The peerConnection is responsible for managing the real-time communication



    // NOW SLY WE WANT TO ADD THE REMOTESTREAM TRACKS TO THE PEERCONNECTION
    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track)
        })
    }


    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'candidate', 'candidate': event.candidate }) }, MemberId)
        }
    }
    // so after we create an offer we set upthe local description now it will start making series of request to the STUN server and will create ice candidates
    // after this we just need to send these to the remote peer 
    // this usually happens by signalling where we get this exchange done via web sockets 


}
// above we just encapsulated the whole code 

let createOffer = async (MemberId) => {
    await createPeerConnnection(MemberId)

    let offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    console.log('offer:', offer)


    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'offer', 'offer': offer }) }, MemberId)//we added member iid here cuz this wil only tell us ki kisko bhjna hai ye msg ya phir sdp offer 
}

// in this we would require both the id and the offer
// REMEMBER 
// that every peer will have a localdescription and  a remote description
// thus for peer 2 local des will be answer and remote will be the offer
// now peer2 will also require to give an answer
let createAnswer = async (MemberId, offer) => {
    await createPeerConnnection(MemberId)

    await peerConnection.setRemoteDescription(offer)

    let answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)


    client.sendMessageToPeer({ text: JSON.stringify({ 'type': 'answer', 'answer': answer }) }, MemberId)//we added member iid here cuz this wil only tell us ki kisko bhjna hai ye msg ya phir sdp offer 

}


// this is just the las step that peer1 reuqires to se up its reotedescription that will be the answer
let addAnswer = async (answer) => {
    if (!peerConnection.currentRemoteDescription) {
        peerConnection.setRemoteDescription(answer)
    }
}


// logic for leaving  
// adding a logic cuz users mostl just close the laptop 
let leaveChannel = async () => {
    await channel.leave()
    await client.logout()
}


let toggleCamera = async () => {
    let videoTrack = localStream.getTracks().find(track => track.kind === 'video')

    if (videoTrack.enabled) {
        videoTrack.enabled = false
        document.getElementById('camera').style.backgroundColor = 'rgb(255,80,80)'
    }
    else {
        videoTrack.enabled = true
        document.getElementById('camera').style.backgroundColor = 'rgb(179,80,80)'
    }
}



let toggleMic = async () => {
    let audioTrack = localStream.getTracks().find(track => track.kind === 'audio')

    if (audioTrack.enabled) {
        audioTrack.enabled = false
        document.getElementById('mute').style.backgroundColor = 'rgb(255,80,80)'
    }
    else {
        audioTrack.enabled = true
        document.getElementById('mute').style.backgroundColor = 'rgb(179,80,80)'
    }
}

window.addEventListener('beforeunload', leaveChannel)

document.getElementById('camera').addEventListener('click', toggleCamera)
document.getElementById('mute').addEventListener('click', toggleMic)
document.getElementById('leave').addEventListener('click', leaveChannel)


init()



// **********************************
// VVVIIIMPPPPPPPPP
/*  
an SDP offer in WebRTC is like an invitation that one device sends to another when they want to start a video 
call or audio call over the internet. This invitation includes information about how the call should work, like 
the video and audio settings to use, and it's used to help both devices agree on how to communicate during the call.  

1. the 1st thing to do after this fn is to create a variable called peerconnection
now this variable will store all the info and also provides us methods to connect to that peer 
2. peerConnection = new RTCPeerConnection():

This line creates a connection between your device and another device over the internet. Think of it like setting up a phone line between you and the other person to talk 
3. remoteStream = new MediaStream():

This prepares a way to receive the other person's video and audio.
4. document.getElementById('user-2').srcObject = remoteStream:

This line is like telling your computer screen to be ready to show the other person's video in an area labeled 'user-2'.
5. let offer = await peerConnection.createOffer():

This is like you asking the other person, "Hey, how should we talk and share video?" You create a kind of plan (called an "offer") for how you want the call to work.
6. await peerConnection.setLocalDescription(offer):

After you make your plan (the offer), you share it with the other person and say, "This is how I want the call to be." 







*/