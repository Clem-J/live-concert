/**
 * viewer.js — Live Concert
 *
 * WebRTC flow (this file handles the "answerer" side):
 *   1. viewer-joined        → tell the server we're here
 *                             server forwards our socket id to the broadcaster
 *   2. signal(offer)        → setRemoteDescription() (broadcaster's SDP)
 *                             createAnswer() → setLocalDescription() (our SDP)
 *                             → send answer via socket
 *   3. signal(ice)          → buffer until remote desc is set, then addIceCandidate()
 *   4. ontrack              → pipe the remote MediaStream into <video>
 */

const socket = io();

const remoteVideo = document.getElementById('remote-video');
const liveBadge   = document.getElementById('live-badge');
const offlineMsg  = document.getElementById('offline-msg');
const btnUnmute   = document.getElementById('btn-unmute');
const status      = document.getElementById('status');

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

let pc            = null;
let from          = null;
let iceCandidates = [];
let remoteDescSet = false;

function resetState() {
  if (pc) { pc.close(); pc = null; }
  from          = null;
  remoteDescSet = false;
  iceCandidates = [];
}

function showStream(stream) {
  // Video starts muted so Chrome autoplay policy allows it without user gesture.
  // The unmute button lets the viewer opt in to sound after the first interaction.
  remoteVideo.srcObject = stream;
  remoteVideo.muted = true;
  remoteVideo.play();

  offlineMsg.style.display = 'none';
  liveBadge.classList.add('visible');
  btnUnmute.hidden = false;
  status.textContent = 'En live.';

  btnUnmute.onclick = () => {
    remoteVideo.muted = false;
    btnUnmute.hidden = true;
  };
}

function createPeerConnection() {
  pc = new RTCPeerConnection(RTC_CONFIG);

  // ontrack fires when the broadcaster's media tracks arrive over the P2P channel.
  // streams[0] is the full MediaStream (video + audio) — not just a single track.
  pc.ontrack = ({ streams }) => {
    if (streams[0]) showStream(streams[0]);
  };

  // Forward our ICE candidates to the broadcaster via signaling.
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('signal', { to: from, data: { type: 'ice', candidate } });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      liveBadge.classList.remove('visible');
      btnUnmute.hidden = true;
      status.textContent = 'Stream interrompu.';
    }
  };
}

// ─── Signaling socket events ─────────────────────────────────────────────────

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
  resetState();
  remoteVideo.srcObject = null;
  liveBadge.classList.remove('visible');
  btnUnmute.hidden = true;
  offlineMsg.style.display = 'flex';
  offlineMsg.textContent = 'En attente du stream...';
  status.textContent = 'Le broadcast est terminé.';
});

socket.on('disconnect', () => {
  status.textContent = 'Connexion au serveur perdue — reconnexion...';
});

// ─── WebRTC signal handler ───────────────────────────────────────────────────

socket.on('signal', async ({ from: senderId, data }) => {
  from = senderId;

  if (data.type === 'offer') {
    // Full reset before each new session — ensures clean state on relaunch
    resetState();
    from = senderId;
    createPeerConnection();

    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    remoteDescSet = true;

    for (const c of iceCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
    iceCandidates = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('signal', { to: from, data: { type: 'answer', sdp: answer } });
    status.textContent = 'Connexion établie...';
  } else if (data.type === 'ice') {
    if (!remoteDescSet) {
      iceCandidates.push(data.candidate);
    } else {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }
});
