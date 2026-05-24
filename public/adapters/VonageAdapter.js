// VonageAdapter — SignalingAdapter implementation using the Vonage Video SDK (OpenTok.js).
//
// Key differences from P2PAdapter:
// - No Socket.io, no RTCPeerConnection, no SDP/ICE handling — Vonage manages all of that.
// - The server generates a session + token; the client connects with OT.initSession() + session.connect().
// - Media flows through Vonage's SFU: broadcaster uploads once, Vonage distributes to all viewers.

class VonageAdapter extends SignalingAdapter {
  constructor() {
    super();
    this._session = null;
    this._publisher = null;
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
    // Vonage creates a <video> element and inserts it into the target container.
    // We use a hidden div to intercept the element and extract the raw MediaStream,
    // then hand it to showStream() so our own UI stays in control.
    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);

    const subscriber = this._session.subscribe(stream, container);

    // videoElementCreated fires when Vonage has finished setting up the <video>.
    // At that point element.srcObject is a live MediaStream.
    subscriber.on('videoElementCreated', ({ element }) => {
      this._onStream?.(element.srcObject);
      container.remove();
    });
  }

  disconnect() {
    this._publisher?.destroy();
    this._publisher = null;
    this._session?.disconnect();
    this._session = null;
  }
}
