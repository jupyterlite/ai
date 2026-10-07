/**
 * There are no processes in the browser: spawn reports ENOENT.
 */
const { EventEmitter } = require('events');

function enoent(command) {
  const error = new Error(`spawn ${command} ENOENT`);
  error.code = 'ENOENT';
  return error;
}

function spawn(command) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), { write() {}, end() {} });
  child.kill = () => true;
  child.pid = undefined;
  queueMicrotask(() => {
    child.emit('error', enoent(command));
    child.emit('close', null);
  });
  return child;
}

function spawnSync(command) {
  return { error: enoent(command), status: null, stdout: '', stderr: '' };
}

function execFile(command, ...args) {
  const callback = args.find(arg => typeof arg === 'function');
  queueMicrotask(() => callback?.(enoent(command), '', ''));
  return spawn(command);
}

function execSync(command) {
  throw enoent(command);
}

/**
 * Also the cross-spawn module: a callable spawn with `sync`.
 */
module.exports = Object.assign(spawn, {
  spawn,
  sync: spawnSync,
  spawnSync,
  execFile,
  execSync
});
