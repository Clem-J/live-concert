const socket = io();

const localVideo = document.getElementById('local-video');
const btnLive    = document.getElementById('btn-live');
const liveBadge  = document.getElementById('live-badge');
const shareLink  = document.getElementById('share-link');
const shareUrl   = document.getElementById('share-url');
const btnCopy    = document.getElementById('btn-copy');
const status     = document.getElementById('status');

// getUserMedia() returns Promise<MediaStream>
// MediaStream contains one video track + one audio track
async function startPreview() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    // srcObject accepts a MediaStream directly — no URL needed
    localVideo.srcObject = stream;

    status.textContent = 'Caméra prête.';
    btnLive.disabled = false;

    // Stored on window so createPeerConnection() can reach it in step 3
    window._localStream = stream;
  } catch (err) {
    status.textContent = `Erreur caméra : ${err.message}`;
  }
}

btnLive.addEventListener('click', () => {
  btnLive.disabled = true;
  liveBadge.classList.add('visible');
  status.textContent = 'En live !';

  shareUrl.value = `${location.origin}/watch`;
  shareLink.classList.add('visible');
});

btnCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(shareUrl.value);
  btnCopy.textContent = 'Copié ✓';
  setTimeout(() => (btnCopy.textContent = 'Copier'), 2000);
});

startPreview();
