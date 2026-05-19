const socket = io();

const localVideo = document.getElementById('local-video');
const btnLive    = document.getElementById('btn-live');
const liveBadge  = document.getElementById('live-badge');
const shareLink  = document.getElementById('share-link');
const shareUrl   = document.getElementById('share-url');
const btnCopy    = document.getElementById('btn-copy');
const status     = document.getElementById('status');

async function startPreview() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = stream;
    status.textContent = 'Caméra prête.';
    btnLive.disabled = false;
    window._localStream = stream;
  } catch (err) {
    status.textContent = `Erreur caméra : ${err.message}`;
  }
}

btnLive.addEventListener('click', () => {
  btnLive.disabled = true;
  liveBadge.classList.add('visible');
  status.textContent = 'En live !';
  socket.emit('broadcaster-ready');
  shareUrl.value = `${location.origin}/watch`;
  shareLink.classList.add('visible');
});

// One RTCPeerConnection per viewer
const peers = {};

function createPeerConnection(viewerId) {
  const pc = new RTCPeerConnection();

  // addTrack() must be called BEFORE createOffer() so the SDP includes m=video + m=audio
  window._localStream.getTracks().forEach((track) => {
    pc.addTrack(track, window._localStream);
  });

  // onicecandidate: forward each discovered network path to the viewer
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('signal', { to: viewerId, data: { type: 'ice', candidate } });
    }
  };

  peers[viewerId] = pc;
  return pc;
}

// New viewer: create RTCPeerConnection and send the SDP offer
socket.on('viewer-joined', async (viewerId) => {
  const pc = createPeerConnection(viewerId);

  // createOffer() generates the SDP — our codec list and media capabilities
  const offer = await pc.createOffer();

  // setLocalDescription() stores the SDP locally AND starts ICE gathering
  await pc.setLocalDescription(offer);

  socket.emit('signal', { to: viewerId, data: { type: 'offer', sdp: offer } });
});

// Receive the viewer's answer (their SDP) and ICE candidates
socket.on('signal', async ({ from, data }) => {
  const pc = peers[from];
  if (!pc) return;

  if (data.type === 'answer') {
    // Both sides now have each other's SDP — agreed codec, media direction
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  } else if (data.type === 'ice') {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

btnCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(shareUrl.value);
  btnCopy.textContent = 'Copié ✓';
  setTimeout(() => (btnCopy.textContent = 'Copier'), 2000);
});

startPreview();
