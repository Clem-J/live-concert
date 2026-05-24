const localVideo = document.getElementById('local-video');
const btnLive    = document.getElementById('btn-live');
const liveBadge  = document.getElementById('live-badge');
const shareLink  = document.getElementById('share-link');
const shareUrl   = document.getElementById('share-url');
const btnCopy    = document.getElementById('btn-copy');
const status     = document.getElementById('status');

// Step 1 — getUserMedia(): access camera + mic, pipe into the local preview.
// The stream is stored on window so the adapter can reach it after the button click.
async function startPreview() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = stream;
    window._localStream = stream;
    status.textContent = 'Camera ready.';
    btnLive.disabled = false;
  } catch (err) {
    status.textContent = `Camera error: ${err.message}`;
  }
}

// Step 2 — Go Live: hand off to the adapter.
// broadcaster.js no longer knows whether it's P2P or Vonage behind the scenes.
btnLive.addEventListener('click', async () => {
  btnLive.disabled = true;
  liveBadge.classList.add('visible');
  status.textContent = 'Connecting...';

  const adapter = await createAdapter();
  adapter
    .onViewerCount(n => { status.textContent = `Live — ${n} viewer(s)`; })
    .onStatus(msg  => { status.textContent = msg; })
    .onError(msg   => {
      status.textContent = `Error: ${msg}`;
      btnLive.disabled = false;
      liveBadge.classList.remove('visible');
      shareLink.classList.remove('visible');
    });

  await adapter.connect('broadcaster', window._localStream);

  status.textContent = 'Live!';
  shareUrl.value = `${location.origin}/watch`;
  shareLink.classList.add('visible');
});

btnCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(shareUrl.value);
  btnCopy.textContent = 'Copied ✓';
  setTimeout(() => (btnCopy.textContent = 'Copy'), 2000);
});

startPreview();
