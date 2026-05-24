// SignalingAdapter — base class that defines the contract every adapter must fulfill.
//
// JavaScript has no compiled interfaces, so we simulate one: any method not
// overridden by a subclass throws at runtime with a clear message instead of
// failing silently with undefined.
//
// Usage (fluent):
//   adapter.onStream(cb).onError(cb).connect('viewer')
//
// Rule: always register callbacks BEFORE calling connect(). connect() is async
// and events can fire immediately — unregistered callbacks would be silently missed.

class SignalingAdapter {
  // Each on*() stores the callback and returns `this` for chaining.
  onStream(cb)      { this._onStream = cb;      return this; }
  onViewerCount(cb) { this._onViewerCount = cb; return this; }
  onStatus(cb)      { this._onStatus = cb;      return this; }
  onError(cb)       { this._onError = cb;       return this; }

  // Subclasses must implement both methods.
  // role: 'broadcaster' | 'viewer'
  // localStream: MediaStream (required for broadcaster, null for viewer)
  async connect(role, localStream) {
    throw new Error(`${this.constructor.name} must implement connect()`);
  }

  disconnect() {
    throw new Error(`${this.constructor.name} must implement disconnect()`);
  }
}
