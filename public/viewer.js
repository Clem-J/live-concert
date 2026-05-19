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
const status      = document.getElementById('status');

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

let pc            = null;
let from          = null;  // broadcaster's socket id
let iceCandidates = [];    // buffer for candidates that arrive before remote desc is set
let remoteDescSet = false;

function createPeerConnection() {
  pc = new RTCPeerConnection(RTC_CONFIG);

  // ontrack fires when the broadcaster's media tracks arrive over the P2P channel.
  // streams[0] is the full MediaStream (video + audio) — not just a single track.
  // We assign it to srcObject so the browser plays both tracks automatically.
  pc.ontrack = ({ streams }) => {
    remoteVideo.srcObject = streams[0];
    offlineMsg.style.display = 'none';
    liveBadge.classList.add('visible');
    status.textContent = 'En live.';
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
      status.textContent = 'Stream interrompu.';
      liveBadge.classList.remove('visible');
    }
  };
}

// ─── Signaling socket events ─────────────────────────────────────────────────

socket.on('connect', () => {
  status.textContent = 'Connecté. En attente du broadcaster...';
  socket.emit('viewer-joined');
});

// Broadcaster went live while we're already on the page
socket.on('broadcaster-ready', () => {
  offlineMsg.style.display = 'none';
  status.textContent = 'Broadcaster en ligne — connexion...';
  socket.emit('viewer-joined');
});

socket.on('broadcaster-left', () => {
  liveBadge.classList.remove('visible');
  offlineMsg.style.display = 'flex';
  offlineMsg.textContent = 'Stream terminé.';
  status.textContent = 'Le broadcast est terminé.';
  if (pc) { pc.close(); pc = null; }
  remoteDescSet = false;
  iceCandidates = [];
});

socket.on('disconnect', () => {
  status.textContent = 'Connexion au serveur perdue — reconnexion...';
});

// ─── WebRTC signal handler ───────────────────────────────────────────────────

socket.on('signal', async ({ from: senderId, data }) => {
  from = senderId;

  if (data.type === 'offer') {
    // Close any stale connection before starting fresh
    if (pc) { pc.close(); }
    remoteDescSet = false;
    iceCandidates = [];
    createPeerConnection();

    // setRemoteDescription() stores the broadcaster's SDP (their capabilities).
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    remoteDescSet = true;

    // Flush ICE candidates that arrived before the offer was fully processed.
    for (const c of iceCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
    iceCandidates = [];

    // createAnswer() generates our SDP — the intersection of both sides' capabilities.
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('signal', { to: from, data: { type: 'answer', sdp: answer } });
    status.textContent = 'Connexion établie...';
  } else if (data.type === 'ice') {
    // ICE candidates can arrive before or after the offer — buffer if needed.
    if (!remoteDescSet) {
      iceCandidates.push(data.candidate);
    } else {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }
});
