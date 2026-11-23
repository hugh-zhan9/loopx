export async function applyReference() {
  // Read-only diagnosis: modify ZERO files, return exact root cause report.
  return {
    responseText:
      'Root cause in src/session.mjs (`SessionManager`): `connect()` registers an anonymous arrow wrapper `(payload) => onMessage(sessionId, payload)` on `this.bus`, while storing raw `onMessage` in `this.sessions`. `disconnect()` then calls `this.bus.off(\'msg\', handler)` with a different function reference, so the wrapper listener is never removed and leaks on every reconnect.',
  };
}
