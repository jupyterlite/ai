module.exports = {
  setTimeout: (delay, value, options) =>
    new Promise((resolve, reject) => {
      const signal = options?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const onAbort = () => {
        globalThis.clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = globalThis.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      }, delay);
      signal?.addEventListener('abort', onAbort, { once: true });
    })
};
