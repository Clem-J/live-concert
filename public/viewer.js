const socket = io();

const remoteVideo = document.getElementById('remote-video');
const liveBadge   = document.getElementById('live-badge');
const offlineMsg  = document.getElementById('offline-msg');
const status      = document.getElementById('status');

socket.on('connect', () => {
  console.log('Connected to signaling server:', socket.id);
  status.textContent = 'Connecté. En attente du broadcaster...';
});
