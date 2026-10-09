/**
 * Line reader over a readable stream, enough for `for await (const line of rl)`.
 */
const { EventEmitter } = require('events');

function createInterface({ input } = {}) {
  const rl = new EventEmitter();
  rl.close = () => {
    input?.destroy?.();
    rl.emit('close');
  };
  rl[Symbol.asyncIterator] = async function* () {
    if (!input) {
      return;
    }
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of input) {
      buffer +=
        typeof chunk === 'string'
          ? chunk
          : decoder.decode(chunk, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        yield buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
      }
    }
    if (buffer) {
      yield buffer;
    }
  };
  return rl;
}

module.exports = { createInterface };
