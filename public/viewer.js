const container = document.getElementById('remote-video');
const liveBadge = document.getElementById('live-badge');
const offlineMsg = document.getElementById('offline-msg');
const btnUnmute  = document.getElementById('btn-unmute');
const status     = document.getElementById('status');

// Called by the adapter when a remote video element is ready.
// Both adapters now deliver an HTMLVideoElement:
//   - VonageAdapter: Vonage created and inserted it into #remote-video already.
//   - P2PAdapter: newly created element that needs to be appended.
// Video starts muted so Chrome autoplay policy allows it without a user gesture.
function showStream(videoEl) {
  videoEl.muted = true;

  if (!container.contains(videoEl)) {
    container.appendChild(videoEl);
    videoEl.play().catch(() => {});
  }

  offlineMsg.style.display = 'none';
  liveBadge.classList.add('visible');
  btnUnmute.hidden = false;
  status.textContent = 'Live.';

  btnUnmute.onclick = () => {
    videoEl.muted = false;
    btnUnmute.hidden = true;
  };
}

// viewer.js no longer knows whether it's P2P or Vonage behind the scenes.
async function init() {
  const adapter = await createAdapter();
  adapter
    .onStream(showStream)
    .onStatus(msg => { status.textContent = msg; })
    .onError(msg  => { status.textContent = `Error: ${msg}`; });

  await adapter.connect('viewer', null);
}

init();
