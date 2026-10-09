/**
 * Node-style timers for the bundled pi modules: pi-tui calls `timer.unref()`.
 */
class NodeTimeout {
  constructor(id) {
    this.id = id;
  }
  unref() {
    return this;
  }
  [Symbol.toPrimitive]() {
    return this.id;
  }
}

const unwrap = timer => (timer instanceof NodeTimeout ? timer.id : timer);

export const setTimeout = (callback, delay, ...args) =>
  new NodeTimeout(globalThis.setTimeout(callback, delay, ...args));
export const setInterval = (callback, delay, ...args) =>
  new NodeTimeout(globalThis.setInterval(callback, delay, ...args));
export const clearTimeout = timer => globalThis.clearTimeout(unwrap(timer));
export const clearInterval = timer => globalThis.clearInterval(unwrap(timer));
export const setImmediate = (callback, ...args) =>
  globalThis.setTimeout(callback, 0, ...args);
