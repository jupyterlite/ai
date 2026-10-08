module.exports = {
  setTimeout: (delay, value) =>
    new Promise(resolve => globalThis.setTimeout(() => resolve(value), delay))
};
