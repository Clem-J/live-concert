const socket = io();

const remoteVideo = document.getElementById('remote-video');
const liveBadge   = document.getElementById('live-badge');
const offlineMsg  = document.getElementById('offline-msg');
const status      = document.getElementById('status');

socket.on('connect', () => {
  status.textContent = 'Connecté. En attente du broadcaster...';
  socket.emit('viewer-joined');
});

socket.on('broadcaster-ready', () => {
  offlineMsg.style.display = 'none';
  status.textContent = 'Broadcaster en ligne — connexion...';
  socket.emit('viewer-joined');
});

socket.on('broadcaster-left', () => {
  liveBadge.classList.remove('visible');
  offlineMsg.style.display = 'flex';
  status.textContent = 'Le stream est terminé.';
});

let pc            = null;
let from          = null;
let iceCandidates = [];   // buffer: ICE candidates can arrive before the offer is processed
let remoteDescSet = false;

function createPeerConnection() {
  pc = new RTCPeerConnection();

  pc.ontrack = ({ streams }) => {
    remoteVideo.srcObject = streams[0];
    offlineMsg.style.display = 'none';
    liveBadge.classList.add('visible');
    status.textContent = 'En live.';
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('signal', { to: from, data: { type: 'ice', candidate } });
    }
  };
}

socket.on('signal', async ({ from: senderId, data }) => {
  from = senderId;

  if (data.type === 'offer') {
    if (!pc) createPeerConnection();

    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    remoteDescSet = true;

    // Flush candidates that arrived before setRemoteDescription completed
    for (const c of iceCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
    iceCandidates = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('signal', { to: from, data: { type: 'answer', sdp: answer } });
    status.textContent = 'Connexion établie...';
  } else if (data.type === 'ice') {
    // addIceCandidate() requires setRemoteDescription to have been called first
    if (!remoteDescSet) {
      iceCandidates.push(data.candidate);
    } else {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }
});
