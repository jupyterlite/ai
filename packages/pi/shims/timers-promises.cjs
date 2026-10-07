module.exports = {
  setTimeout: (delay, value) =>
    new Promise(resolve => globalThis.setTimeout(() => resolve(value), delay)),
  setImmediate: value =>
    new Promise(resolve => globalThis.setTimeout(() => resolve(value), 0))
};
