const { sha256 } = require('@noble/hashes/sha2.js');
const { Buffer } = require('buffer');

function createHash() {
  const hash = sha256.create();
  const api = {
    update(data, encoding) {
      hash.update(
        typeof data === 'string' ? Buffer.from(data, encoding) : data
      );
      return api;
    },
    digest(encoding) {
      const out = Buffer.from(hash.digest());
      return encoding ? out.toString(encoding) : out;
    }
  };
  return api;
}

/**
 * A version 4 UUID. Pages served over http from another host than localhost
 * have no crypto.randomUUID.
 */
function randomUUID() {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
  return hex.join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
}

module.exports = {
  randomUUID,
  randomBytes: size =>
    Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size))),
  createHash
};
