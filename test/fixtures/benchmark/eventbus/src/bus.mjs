// Single-slot event bus. `on` keeps exactly one handler per event name:
// re-registering an event intentionally replaces the previous handler so a
// runtime reconfiguration is a plain re-registration (pinned by the tests).
export function createBus() {
  const handlers = new Map();
  return {
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, payload) {
      const handler = handlers.get(event);
      if (handler) handler(payload);
    },
  };
}
