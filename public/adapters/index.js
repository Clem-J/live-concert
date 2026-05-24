// Factory — the only place that decides which adapter implementation to use.
// All other code (broadcaster.js, viewer.js) depends on the interface, never on a concrete class.

async function createAdapter() {
  const { adapter } = await fetch('/config').then(r => r.json());
  return adapter === 'vonage' ? new VonageAdapter() : new P2PAdapter();
}
