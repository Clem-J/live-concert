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

// In-memory session — one broadcaster at a time, no persistence
let broadcasterSocketId = null;

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Broadcaster announces it's live
  socket.on('broadcaster-ready', () => {
    broadcasterSocketId = socket.id;
    console.log('Broadcaster ready:', socket.id);
    // Tell every connected viewer the broadcast just started
    socket.broadcast.emit('broadcaster-ready');
  });

  // Viewer announces it wants to watch
  // Server acts as matchmaker: tells the broadcaster who just arrived
  socket.on('viewer-joined', () => {
    console.log('Viewer joined:', socket.id);
    if (broadcasterSocketId) {
      io.to(broadcasterSocketId).emit('viewer-joined', socket.id);
    }
  });

  // Generic signal relay — forwards SDP and ICE payloads between peers
  // The server never inspects the payload, only routes it
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
