/**
 * There are no processes in the browser: spawn reports ENOENT, except for the
 * commands that run in the page. The host adds them to `commands`: a function
 * of the arguments and an abort signal that resolves with the standard output.
 */
const { EventEmitter } = require('events');

const commands = new Map();

function enoent(command) {
  const error = new Error(`spawn ${command} ENOENT`);
  error.code = 'ENOENT';
  return error;
}

function spawn(command, args = []) {
  const child = new EventEmitter();
  child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding() {} });
  child.stdin = Object.assign(new EventEmitter(), { write() {}, end() {} });
  child.pid = undefined;
  child.exitCode = null;
  const controller = new AbortController();
  child.kill = () => {
    controller.abort();
    return true;
  };
  const run = commands.get(command);
  queueMicrotask(() => {
    if (!run) {
      child.emit('error', enoent(command));
      child.emit('close', null);
      return;
    }
    run(args, controller.signal).then(
      output => {
        child.stdout.emit('data', output);
        child.emit('close', 0);
      },
      () => child.emit('close', 1)
    );
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
  commands,
  spawn,
  sync: spawnSync,
  spawnSync,
  execFile,
  execSync
});
