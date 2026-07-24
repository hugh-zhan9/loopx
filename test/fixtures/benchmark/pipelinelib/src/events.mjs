// Minimal synchronous event emitter used across the pipeline runtime.
export class Emitter {
  #handlers = new Map();

  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('handler must be a function');
    }
    if (!this.#handlers.has(event)) {
      this.#handlers.set(event, new Set());
    }
    this.#handlers.get(event).add(handler);
    return this;
  }

  off(event, handler) {
    this.#handlers.get(event)?.delete(handler);
    return this;
  }

  listenerCount(event) {
    return this.#handlers.get(event)?.size ?? 0;
  }

  emit(event, payload) {
    const handlers = this.#handlers.get(event);
    if (!handlers) {
      return 0;
    }
    let invoked = 0;
    for (const handler of handlers) {
      handler(payload);
      invoked += 1;
    }
    return invoked;
  }
}
