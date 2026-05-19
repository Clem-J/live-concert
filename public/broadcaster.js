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

  // Announce to the signaling server that the broadcast is starting
  socket.emit('broadcaster-ready');

  shareUrl.value = `${location.origin}/watch`;
  shareLink.classList.add('visible');
});

// Server tells us a viewer is ready — WebRTC offer/answer in next step
socket.on('viewer-joined', (viewerId) => {
  console.log('New viewer:', viewerId);
});

btnCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(shareUrl.value);
  btnCopy.textContent = 'Copié ✓';
  setTimeout(() => (btnCopy.textContent = 'Copier'), 2000);
});

startPreview();
