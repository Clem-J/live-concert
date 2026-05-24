// P2PAdapter — SignalingAdapter implementation using Socket.io + RTCPeerConnection.
//
// This is the existing hand-rolled WebRTC signaling logic extracted from
// broadcaster.js and viewer.js into a single encapsulated class.
// Socket.io is only instantiated when this adapter is actually used —
// VonageAdapter never opens a Socket.io connection.

class P2PAdapter extends SignalingAdapter {
  constructor() {
    super();
    this._socket = null;
    this._peers = {};   // { viewerId → RTCPeerConnection } — broadcaster only
    this._pc = null;    // single RTCPeerConnection — viewer only
    this._from = null;  // broadcaster socket id seen by the viewer
  }

  async connect(role, localStream) {
    this._socket = io();
    this._localStream = localStream;

    if (role === 'broadcaster') {
      this._connectAsBroadcaster();
    } else {
      this._connectAsViewer();
    }
  }

  // ─── Broadcaster ────────────────────────────────────────────────────────────

  _connectAsBroadcaster() {
    const socket = this._socket;

    socket.on('connect', () => {
      socket.emit('broadcaster-ready');
    });

    // A new viewer is ready — open a dedicated RTCPeerConnection toward them.
    socket.on('viewer-joined', async (viewerId) => {
      if (this._peers[viewerId]) {
        this._peers[viewerId].close();
        delete this._peers[viewerId];
      }

      const pc = this._createBroadcasterPc(viewerId);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { to: viewerId, data: { type: 'offer', sdp: offer } });
    });

    // Receive answers and ICE candidates from viewers.
    socket.on('signal', async ({ from, data }) => {
      const pc = this._peers[from];
      if (!pc) return;

      if (data.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.type === 'ice') {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socket.on('error', (msg) => this._onError?.(msg));
    socket.on('disconnect', () => this._onStatus?.('Disconnected from server — reconnecting...'));
  }

  _createBroadcasterPc(viewerId) {
    const pc = new RTCPeerConnection(P2PAdapter.RTC_CONFIG);

    // addTrack() must be called before createOffer() so the SDP includes
    // m=video and m=audio sections. Without it the offer is media-less.
    this._localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this._localStream);
    });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this._socket.emit('signal', { to: viewerId, data: { type: 'ice', candidate } });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' || pc.connectionState === 'disconnected') {
        // Recount live peers instead of maintaining a separate counter that could drift.
        const connected = Object.values(this._peers)
          .filter(p => p.connectionState === 'connected').length;
        this._onViewerCount?.(connected);
      }
    };

    this._peers[viewerId] = pc;
    return pc;
  }

  // ─── Viewer ─────────────────────────────────────────────────────────────────

  _connectAsViewer() {
    const socket = this._socket;
    let iceCandidates = [];
    let remoteDescSet = false;

    const resetState = () => {
      if (this._pc) { this._pc.close(); this._pc = null; }
      this._from = null;
      remoteDescSet = false;
      iceCandidates = [];
    };

    socket.on('connect', () => {
      this._onStatus?.('Connected — waiting for broadcaster...');
      socket.emit('viewer-joined');
    });

    // If a broadcaster is already live when we connect, join immediately.
    socket.on('broadcaster-ready', () => {
      socket.emit('viewer-joined');
    });

    socket.on('broadcaster-left', () => {
      resetState();
      this._onStatus?.('Broadcast ended.');
    });

    socket.on('signal', async ({ from: senderId, data }) => {
      this._from = senderId;

      if (data.type === 'offer') {
        resetState();
        this._from = senderId;

        this._pc = new RTCPeerConnection(P2PAdapter.RTC_CONFIG);

        // ontrack fires when the broadcaster's media arrives over the P2P channel.
        // We wrap the stream in a <video> element so onStream always delivers
        // an HTMLVideoElement, consistent with VonageAdapter's contract.
        this._pc.ontrack = ({ streams }) => {
          if (!streams[0]) return;
          const video = document.createElement('video');
          video.srcObject = streams[0];
          video.autoplay  = true;
          video.playsInline = true;
          this._onStream?.(video);
        };

        this._pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            socket.emit('signal', { to: this._from, data: { type: 'ice', candidate } });
          }
        };

        this._pc.onconnectionstatechange = () => {
          if (this._pc?.connectionState === 'disconnected' ||
              this._pc?.connectionState === 'failed') {
            this._onStatus?.('Stream interrupted.');
          }
        };

        await this._pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        remoteDescSet = true;

        // Flush ICE candidates that arrived before setRemoteDescription completed.
        for (const c of iceCandidates) {
          await this._pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        iceCandidates = [];

        const answer = await this._pc.createAnswer();
        await this._pc.setLocalDescription(answer);
        socket.emit('signal', { to: this._from, data: { type: 'answer', sdp: answer } });
        this._onStatus?.('Establishing connection...');

      } else if (data.type === 'ice') {
        // Buffer candidates if remote description is not yet applied.
        if (!remoteDescSet) {
          iceCandidates.push(data.candidate);
        } else {
          await this._pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      }
    });

    socket.on('disconnect', () => {
      this._onStatus?.('Connection to server lost — reconnecting...');
    });
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  disconnect() {
    Object.values(this._peers).forEach(pc => pc.close());
    this._peers = {};
    this._pc?.close();
    this._pc = null;
    this._socket?.disconnect();
    this._socket = null;
  }
}

// Static config shared by all RTCPeerConnection instances in this adapter.
P2PAdapter.RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};
