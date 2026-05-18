const socket = io();

// DOM elements
const welcomeCard = document.getElementById('welcome-card');
const callContainer = document.getElementById('call-container');
const joinBtn = document.getElementById('join-btn');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const currentRoomLabel = document.getElementById('current-room');
const connectionStatus = document.getElementById('connection-status');
const connectionStatusDot = document.getElementById('connection-status-dot');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteLabel = document.getElementById('remote-label');
const messages = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const toggleMic = document.getElementById('toggle-mic');
const toggleCamera = document.getElementById('toggle-camera');
const shareScreenBtn = document.getElementById('share-screen');
const leaveCallBtn = document.getElementById('leave-call');

let localStream = null;
let peerConnections = {};
let username = '';
let roomId = '';
let isMuted = false;
let cameraOff = false;
let currentVideoTrack = null;
let screenTrack = null;

// Important concepts used in this application:
// - RTCPeerConnection: The browser object that manages the direct peer-to-peer connection.
// - SDP Offer / SDP Answer: These are session descriptions exchanged between browsers.
//   The offer describes what media the caller wants to share, and the answer confirms it.
// - ICE Candidates: Network addresses discovered by each browser so peers can connect.
// - STUN Server: Helps browsers determine their public IP when behind NAT/firewalls.
// - Signaling Server: Socket.IO is used for signaling only, carrying offer/answer/ICE messages.
// - Peer-to-peer connection: After signaling, audio/video flows directly between browsers.
//
// Socket.IO is only used for:
// * join-room
// * offer
// * answer
// * ice-candidate
// * message
// * typing
// * disconnect
//
// WebRTC handles the direct media streaming for video, audio, and screen sharing.
// Once the connection is established, media travels browser-to-browser without passing
// through the server.

// WebRTC configuration with Google STUN server.
// STUN is needed so peers behind NAT/firewall can discover their public IP address
// and create candidate addresses for the browser-to-browser connection.
const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
    },
  ],
};

function setConnectionState(state) {
  connectionStatus.textContent = state;
  if (state === 'Connected') {
    connectionStatusDot.style.background = '#34d399';
  } else if (state === 'Connecting') {
    connectionStatusDot.style.background = '#fbbf24';
  } else {
    connectionStatusDot.style.background = '#f44336';
  }
}

function appendMessage({ username: sender, text, timestamp, own }) {
  const messageBlock = document.createElement('div');
  messageBlock.className = 'message-block';
  if (own) {
    messageBlock.style.borderColor = '#5d7bff';
    messageBlock.style.background = 'rgba(53, 63, 119, 0.94)';
  }

  const senderLabel = document.createElement('strong');
  senderLabel.textContent = own ? 'You' : sender;
  const messageText = document.createElement('div');
  messageText.textContent = text;
  const timeLabel = document.createElement('time');
  timeLabel.textContent = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  messageBlock.append(senderLabel, messageText, timeLabel);
  messages.appendChild(messageBlock);
  messages.scrollTop = messages.scrollHeight;
}

function updateTypingIndicator({ username: typingUser, isTyping }) {
  typingIndicator.textContent = isTyping ? `${typingUser} is typing...` : '';
}

function updateRemoteLabel(name) {
  remoteLabel.textContent = name ? `Connected with ${name}` : 'Waiting for a friend...';
}

function createPeerConnection(remoteSocketId, remoteUsername) {
  if (peerConnections[remoteSocketId]) {
    return peerConnections[remoteSocketId];
  }

  const pc = new RTCPeerConnection(configuration);
  peerConnections[remoteSocketId] = pc;

  // Add local camera/microphone tracks to the peer connection.
  // These media tracks are sent directly browser-to-browser via WebRTC.
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  // Listen for remote tracks from the other peer.
  // When the remote track arrives, display it in the remote video element.
  pc.ontrack = (event) => {
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      updateRemoteLabel(remoteUsername);
    }
  };

  // When an ICE candidate is discovered by the browser, send it via Socket.IO.
  // Socket.IO is only used for signaling and chat, not for actual audio/video transport.
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        targetSocketId: remoteSocketId,
        candidate: event.candidate,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      setConnectionState('Connected');
    } else if (pc.connectionState === 'connecting') {
      setConnectionState('Connecting');
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      setConnectionState('Disconnected');
      updateRemoteLabel('Disconnected');
    }
  };

  return pc;
}

async function prepareMedia() {
  // Get camera and microphone permission from the browser.
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  localVideo.srcObject = localStream;
  currentVideoTrack = localStream.getVideoTracks()[0];
}

async function startCall() {
  welcomeCard.classList.add('hidden');
  callContainer.classList.remove('hidden');
  currentRoomLabel.textContent = roomId;
  setConnectionState('Connecting');

  await prepareMedia();
  socket.emit('join-room', { roomId, username });
}

async function handleRoomUsers(participants) {
  // If there are already people in the room, create an offer for each.
  for (const peer of participants) {
    const pc = createPeerConnection(peer.socketId, peer.username);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', {
      targetSocketId: peer.socketId,
      offer,
    });
  }
}

async function handleOffer({ fromSocketId, offer }) {
  const pc = createPeerConnection(fromSocketId, 'Friend');
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', {
    targetSocketId: fromSocketId,
    answer,
  });
}

async function handleAnswer({ fromSocketId, answer }) {
  const pc = peerConnections[fromSocketId];
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

async function handleIceCandidate({ fromSocketId, candidate }) {
  const pc = peerConnections[fromSocketId];
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });
  toggleMic.textContent = isMuted ? 'Unmute' : 'Mute';
}

function toggleCameraState() {
  if (!localStream) return;
  cameraOff = !cameraOff;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = !cameraOff;
  });
  toggleCamera.textContent = cameraOff ? 'Camera On' : 'Camera Off';
}

async function shareScreen() {
  if (!navigator.mediaDevices.getDisplayMedia) {
    alert('Screen sharing is not supported in this browser.');
    return;
  }

  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenTrack = displayStream.getVideoTracks()[0];

    // Replace current video track with screen track for all active peer connections.
    Object.values(peerConnections).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(screenTrack);
      }
    });

    // Show screen share preview locally.
    localVideo.srcObject = displayStream;

    screenTrack.onended = () => {
      // When screen sharing stops, restore the camera video.
      if (localStream && currentVideoTrack) {
        localVideo.srcObject = localStream;
        Object.values(peerConnections).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(currentVideoTrack);
          }
        });
      }
    };
  } catch (error) {
    console.error('Screen share failed', error);
  }
}

function leaveCall() {
  Object.values(peerConnections).forEach((pc) => pc.close());
  peerConnections = {};

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  socket.disconnect();
  window.location.reload();
}

joinBtn.addEventListener('click', async () => {
  username = usernameInput.value.trim() || 'Guest';
  roomId = roomIdInput.value.trim();

  if (!roomId) {
    alert('Please enter a room ID.');
    return;
  }

  await startCall();
});

sendBtn.addEventListener('click', () => {
  const text = messageInput.value.trim();
  if (!text) return;
  appendMessage({ username, text, timestamp: new Date().toISOString(), own: true });
  socket.emit('message', { roomId, username, text });
  messageInput.value = '';
  socket.emit('typing', { roomId, username, isTyping: false });
});

messageInput.addEventListener('input', () => {
  const isTyping = messageInput.value.trim().length > 0;
  socket.emit('typing', { roomId, username, isTyping });
});

toggleMic.addEventListener('click', toggleMute);
toggleCamera.addEventListener('click', toggleCameraState);
shareScreenBtn.addEventListener('click', shareScreen);
leaveCallBtn.addEventListener('click', leaveCall);

socket.on('room-users', handleRoomUsers);
socket.on('user-joined', ({ socketId, username: peerName }) => {
  setConnectionState('Connecting');
  createPeerConnection(socketId, peerName);
});
socket.on('offer', handleOffer);
socket.on('answer', handleAnswer);
socket.on('ice-candidate', handleIceCandidate);
socket.on('message', ({ username: sender, text, timestamp }) => {
  appendMessage({ username: sender, text, timestamp, own: false });
});
socket.on('typing', ({ username: typingUser, isTyping }) => {
  updateTypingIndicator({ username: typingUser, isTyping });
});
socket.on('user-disconnected', ({ socketId, username: peerName }) => {
  if (peerConnections[socketId]) {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  }
  setConnectionState('Disconnected');
  updateRemoteLabel(`${peerName} left`);
});

window.addEventListener('beforeunload', () => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
});
