// VonageAdapter — SignalingAdapter implementation using the Vonage Video SDK (OpenTok.js).
//
// Key differences from P2PAdapter:
// - No Socket.io, no RTCPeerConnection, no SDP/ICE handling — Vonage manages all of that.
// - The server generates a session + token; the client connects with OT.initSession() + session.connect().
// - Media flows through Vonage's SFU: broadcaster uploads once, Vonage distributes to all viewers.

class VonageAdapter extends SignalingAdapter {
  constructor() {
    super();
    this._session   = null;
    this._publisher = null;
    this._subscriber = null;
  }

  async connect(role, localStream) {
    // Step 1 — fetch credentials from the server.
    // The server holds the private key; the client only ever sees the token (a signed JWT).
    const vonageRole = role === 'broadcaster' ? 'publisher' : 'subscriber';
    const res = await fetch(`/vonage/token?role=${vonageRole}`);
    const { applicationId, sessionId, token } = await res.json();

    // Step 2 — create the local session object. No network call happens here.
    // OT.initSession() only builds a JS object with the session coordinates.
    // Listeners must be attached before connect() so no early events are missed.
    this._session = OT.initSession(applicationId, sessionId);

    // Step 3 — attach event listeners before any network activity.
    this._attachSessionEvents(role);

    // Step 4 — connect to Vonage's servers (WebSocket handshake).
    // The token proves identity and role to Vonage.
    this._session.connect(token, (err) => {
      if (err) {
        this._onError?.(`Connection failed: ${err.message}`);
        return;
      }

      // Step 5 (broadcaster only) — start publishing after the session confirms open.
      if (role === 'broadcaster' && localStream) {
        this._publish(localStream);
      }
    });
  }

  _attachSessionEvents(role) {
    // streamCreated fires whenever a participant starts publishing in the session.
    // This is the Vonage equivalent of the P2P 'viewer-joined' event — but inverted:
    // it's the viewer that receives this event, not the broadcaster.
    this._session.on('streamCreated', (event) => {
      if (role === 'viewer') {
        this._subscribe(event.stream);
      }
    });

    this._session.on('streamDestroyed', () => {
      this._onStatus?.('Broadcast ended.');
    });

    // connectionCreated fires for every participant joining, including self.
    // Subtract 1 to exclude the local connection from the viewer count.
    this._session.on('connectionCreated', () => {
      const count = this._session.connections.length - 1;
      this._onViewerCount?.(count);
    });

    this._session.on('connectionDestroyed', () => {
      const count = this._session.connections.length - 1;
      this._onViewerCount?.(count);
    });
  }

  _publish(localStream) {
    // Reuse the existing getUserMedia() tracks — avoids a second camera access request
    // and keeps the local preview working while the stream is live.
    // insertDefaultUI: false — Vonage won't inject its own <div> into the DOM.
    this._publisher = OT.initPublisher(null, {
      videoSource: localStream.getVideoTracks()[0],
      audioSource: localStream.getAudioTracks()[0],
      insertDefaultUI: false,
    });

    this._session.publish(this._publisher, (err) => {
      if (err) this._onError?.(`Publish failed: ${err.message}`);
    });
  }

  _subscribe(stream) {
    // Subscribe directly into the visible container — Vonage owns and manages
    // its <video> element there. No hidden container needed: the element is
    // rendered normally, so Vonage's pause detection never triggers.
    const container = document.getElementById('remote-video');
    this._subscriber = this._session.subscribe(stream, container, {
      width: '100%',
      height: '100%',
    });

    // videoElementCreated fires once Vonage has created and inserted its <video>.
    // We mute it (Chrome autoplay policy) and surface it via onStream so viewer.js
    // can show the live badge and wire up the unmute button.
    this._subscriber.on('videoElementCreated', ({ element }) => {
      element.muted = true;
      this._onStream?.(element);
    });
  }

  disconnect() {
    this._publisher?.destroy();
    this._publisher = null;
    if (this._subscriber && this._session) {
      this._session.unsubscribe(this._subscriber);
    }
    this._subscriber = null;
    this._session?.disconnect();
    this._session = null;
  }
}
