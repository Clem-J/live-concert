const remoteVideo = document.getElementById('remote-video');
const liveBadge   = document.getElementById('live-badge');
const offlineMsg  = document.getElementById('offline-msg');
const btnUnmute   = document.getElementById('btn-unmute');
const status      = document.getElementById('status');

// Called by the adapter when a remote stream becomes available.
// Video starts muted so Chrome autoplay policy allows it without a user gesture.
function showStream(stream) {
  remoteVideo.srcObject = stream;
  remoteVideo.muted = true;
  remoteVideo.play();

  offlineMsg.style.display = 'none';
  liveBadge.classList.add('visible');
  btnUnmute.hidden = false;
  status.textContent = 'Live.';

  btnUnmute.onclick = () => {
    remoteVideo.muted = false;
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
