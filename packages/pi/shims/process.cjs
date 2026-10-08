/**
 * Browser stand-in for the Node process object of the bundled pi modules.
 */
const { EventEmitter } = require('events');

const HOME = '/home/user';

class ProcessExit extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExit';
    this.code = code;
  }
}

class StdStream extends EventEmitter {
  constructor() {
    super();
    this.isTTY = false;
    this.writableLength = 0;
  }
  write() {
    return true;
  }
  setRawMode() {
    return this;
  }
  setEncoding() {
    return this;
  }
  resume() {
    return this;
  }
  pause() {
    return this;
  }
}

const proc = new EventEmitter();

Object.assign(proc, {
  ProcessExit,
  env: {
    HOME,
    USER: 'user',
    SHELL: '/bin/sh',
    PATH: '/usr/bin:/bin',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    PI_PACKAGE_DIR: '/pi',
    PI_CODING_AGENT_DIR: `${HOME}/.pi/agent`,
    PI_OFFLINE: '1',
    PI_SKIP_VERSION_CHECK: '1'
  },
  platform: 'linux',
  arch: 'x64',
  pid: 42,
  version: 'v24.0.0',
  versions: {},
  features: { sea: false, inspector: false, typescript: false },
  getBuiltinModule() {
    return undefined;
  },
  argv: ['/usr/bin/node', '/pi/dist/cli.js'],
  execPath: '/usr/bin/node',
  exitCode: undefined,
  _cwd: '/drive',
  cwd() {
    return proc._cwd;
  },
  chdir(directory) {
    proc._cwd = directory;
  },
  nextTick(callback, ...args) {
    queueMicrotask(() => callback(...args));
  },
  exit(code = 0) {
    throw new ProcessExit(code);
  },
  kill() {
    return true;
  },
  emitWarning() {},
  stdin: new StdStream(),
  stdout: new StdStream(),
  stderr: new StdStream()
});

module.exports = proc;
