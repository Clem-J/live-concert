/**
 * broadcaster.js — Live Concert
 *
 * WebRTC flow (this file handles the "offerer" side):
 *   1. getUserMedia()       → access camera + mic → local preview
 *   2. broadcaster-ready    → tell the signaling server we're live
 *   3. viewer-joined        → for each new viewer, create RTCPeerConnection
 *                             addTrack() → createOffer() → setLocalDescription()
 *                             → send offer via socket
 *   4. signal(answer)       → setRemoteDescription() → P2P channel open
 *   5. signal(ice)          → addIceCandidate() → best network path selected
 */

const socket = io();

const localVideo = document.getElementById('local-video');
const btnLive    = document.getElementById('btn-live');
const liveBadge  = document.getElementById('live-badge');
const shareLink  = document.getElementById('share-link');
const shareUrl   = document.getElementById('share-url');
const btnCopy    = document.getElementById('btn-copy');
const status     = document.getElementById('status');

// ─── Step 1: getUserMedia ────────────────────────────────────────────────────
// getUserMedia() returns Promise<MediaStream>.
// MediaStream = a container of tracks (one video track + one audio track here).
// We pipe it into <video srcObject> for the local preview — no upload, no server.
async function startPreview() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.srcObject = stream;
    status.textContent = 'Caméra prête.';
    btnLive.disabled = false;

    // Stored on window so createPeerConnection() can reach it later.
    window._localStream = stream;
  } catch (err) {
    status.textContent = `Erreur caméra : ${err.message}`;
  }
}

// ─── Step 2: signaling — announce broadcast ──────────────────────────────────
btnLive.addEventListener('click', () => {
  btnLive.disabled = true;
  liveBadge.classList.add('visible');
  status.textContent = 'En live !';

  // Signal the server: "I'm the broadcaster, register my socket id."
  // The server will then forward viewer-joined events to this socket.
  socket.emit('broadcaster-ready');

  shareUrl.value = `${location.origin}/watch`;
  shareLink.classList.add('visible');
});

// ─── Steps 3–5: WebRTC per viewer ───────────────────────────────────────────

// One RTCPeerConnection per viewer (P2P = one connection per pair).
const peers = {};

// ICE / STUN config.
// STUN tells us our public IP so ICE candidates can include it.
// Without STUN, WebRTC only works on the same local network.
const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function createPeerConnection(viewerId) {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  // addTrack() must be called BEFORE createOffer() so the SDP includes
  // the m=video and m=audio sections. Without this, the offer is media-less.
  window._localStream.getTracks().forEach((track) => {
    pc.addTrack(track, window._localStream);
  });

  // onicecandidate fires each time the browser discovers a new network path.
  // We forward candidates to the viewer via signaling ("trickle ICE").
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('signal', { to: viewerId, data: { type: 'ice', candidate } });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`Peer ${viewerId} state: ${pc.connectionState}`);
    if (pc.connectionState === 'connected') {
      status.textContent = `En live — ${Object.keys(peers).length} spectateur(s)`;
    }
  };

  peers[viewerId] = pc;
  return pc;
}

// Server tells us a viewer is ready — initiate the offer/answer handshake.
socket.on('viewer-joined', async (viewerId) => {
  // If this viewer already has a connection (e.g. page refresh), close the old one.
  if (peers[viewerId]) {
    peers[viewerId].close();
    delete peers[viewerId];
  }

  const pc = createPeerConnection(viewerId);

  // createOffer() generates the SDP: codec list, bandwidth, media directions.
  const offer = await pc.createOffer();

  // setLocalDescription() stores the offer locally AND starts ICE gathering.
  await pc.setLocalDescription(offer);

  socket.emit('signal', { to: viewerId, data: { type: 'offer', sdp: offer } });
});

// Receive signals from viewers (answers + their ICE candidates).
socket.on('signal', async ({ from, data }) => {
  const pc = peers[from];
  if (!pc) return;

  if (data.type === 'answer') {
    // answer = viewer's SDP (their codec capabilities).
    // After this, both sides know the agreed format — media can flow.
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  } else if (data.type === 'ice') {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// ─── UI + socket lifecycle ───────────────────────────────────────────────────

btnCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(shareUrl.value);
  btnCopy.textContent = 'Copié ✓';
  setTimeout(() => (btnCopy.textContent = 'Copier'), 2000);
});

// Server error (e.g. a broadcaster is already live)
socket.on('error', (msg) => {
  status.textContent = `Erreur : ${msg}`;
  btnLive.disabled = false;
  liveBadge.classList.remove('visible');
});

// Reset UI if the connection to the signaling server drops
socket.on('disconnect', () => {
  status.textContent = 'Déconnecté du serveur — reconnexion...';
});

socket.on('connect', () => {
  if (liveBadge.classList.contains('visible')) {
    status.textContent = 'Reconnecté. Relancez le live.';
    btnLive.disabled = false;
    liveBadge.classList.remove('visible');
    shareLink.classList.remove('visible');
  }
});

startPreview();
