const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// Single in-memory session — one broadcaster at a time, no persistence.
// In production (multi-user, multi-room) this would live in Redis.
let broadcasterSocketId = null;

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Broadcaster announces it's live.
  // We reject a second broadcaster so the slot is never silently stolen.
  socket.on('broadcaster-ready', () => {
    if (broadcasterSocketId && broadcasterSocketId !== socket.id) {
      socket.emit('error', 'Un broadcaster est déjà en live.');
      return;
    }
    broadcasterSocketId = socket.id;
    console.log('Broadcaster ready:', socket.id);
    socket.broadcast.emit('broadcaster-ready');
  });

  // Viewer announces it wants to watch.
  // The server acts as a matchmaker: it tells the broadcaster who just arrived
  // so the broadcaster can initiate the WebRTC offer toward that specific viewer.
  socket.on('viewer-joined', () => {
    console.log('Viewer joined:', socket.id);
    if (broadcasterSocketId) {
      io.to(broadcasterSocketId).emit('viewer-joined', socket.id);
    }
  });

  // Generic signal relay — forwards SDP offers/answers and ICE candidates.
  // The server never inspects the payload; it only routes it to the right socket.
  // payload: { to: socketId, data: { type: 'offer'|'answer'|'ice', ... } }
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.id === broadcasterSocketId) {
      broadcasterSocketId = null;
      socket.broadcast.emit('broadcaster-left');
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Live Concert → http://localhost:${PORT}`);
});
