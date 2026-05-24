require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Video, MediaMode } = require('@vonage/video');
const fs = require('fs');

// New Vonage Managed Video API auth: Application ID + RSA private key.
// Unlike legacy OpenTok (API Key + Secret), the SDK signs every request
// with a JWT built from the private key — the secret never travels over the wire.
const vonageVideo = new Video({
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: fs.readFileSync(process.env.VONAGE_PRIVATE_KEY),
});

// One session per server lifecycle — lazy init on first request.
// Production would store sessionId per room in a database.
let vonageSessionId = null;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

// Expose l'adapter sélectionné au client sans lui donner accès aux variables d'env.
app.get('/config', (req, res) => {
  res.json({ adapter: process.env.SIGNALING_ADAPTER || 'p2p' });
});

// Génère une session Vonage (lazy) + un token pour le rôle demandé.
app.get('/vonage/token', async (req, res) => {
  try {
    if (!vonageSessionId) {
      const session = await vonageVideo.createSession({ mediaMode: MediaMode.ROUTED });
      vonageSessionId = session.sessionId;
    }
    const role = req.query.role === 'publisher' ? 'publisher' : 'subscriber';
    const token = vonageVideo.generateClientToken(vonageSessionId, { role });
    // The client needs applicationId (not the legacy apiKey) to call OT.initSession().
    res.json({ applicationId: process.env.VONAGE_APPLICATION_ID, sessionId: vonageSessionId, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
