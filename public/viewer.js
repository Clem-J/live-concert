const socket = io();

const remoteVideo = document.getElementById('remote-video');
const liveBadge   = document.getElementById('live-badge');
const offlineMsg  = document.getElementById('offline-msg');
const status      = document.getElementById('status');

socket.on('connect', () => {
  status.textContent = 'Connecté. En attente du broadcaster...';
  // Tell the server a viewer is here so it can notify the broadcaster
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
  status.textContent = 'Le stream est terminé.';
});

// WebRTC signal handling: next step
socket.on('signal', ({ from, data }) => {
  console.log('Signal received from', from, data);
});
