import { EventEmitter } from 'node:events';

// Bug: subscribeSession registers an anonymous arrow wrapper on bus,
// then unsubscribe attempts to remove the original handler reference —
// so the listener leaks on every reconnect.
export class SessionManager {
  constructor(bus = new EventEmitter()) {
    this.bus = bus;
    this.sessions = new Map();
  }

  connect(sessionId, onMessage) {
    this.bus.on('msg', (payload) => onMessage(sessionId, payload));
    this.sessions.set(sessionId, onMessage);
  }

  disconnect(sessionId) {
    const handler = this.sessions.get(sessionId);
    if (!handler) return;
    this.bus.off('msg', handler);
    this.sessions.delete(sessionId);
  }
}
