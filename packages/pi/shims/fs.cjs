/**
 * Synchronous in-memory file system (memfs) for pi, seeded with the files pi
 * reads from its own package. Each changed path is reported to `fs.onChange`.
 */
const { Volume, createFsFromVolume } = require('memfs');
const path = require('path');
const piPackage = require('pi-coding-agent-package/package.json');
const darkTheme = require('pi-coding-agent-package/dist/modes/interactive/theme/dark.json');
const lightTheme = require('pi-coding-agent-package/dist/modes/interactive/theme/light.json');
const readme = require('pi-coding-agent-package/README.md');
const docs = require.context('pi-coding-agent-package/docs', false, /\.md$/);

const vol = new Volume();
const fs = createFsFromVolume(vol);
fs.vol = vol;

const MUTATING = /^(write|append|rename|unlink|rm|copy|truncate)/;
/**
 * Calls that create their second argument (a file); a rename also removes
 * the first.
 */
const DESTINATION = /^(rename|copy)/;

function resolve(target) {
  return typeof target === 'string' ? path.resolve(target) : undefined;
}

function report(target) {
  const changed = resolve(target);
  if (changed !== undefined) {
    fs.onChange?.(changed);
  }
}

function track(target) {
  for (const name of Object.keys(target)) {
    const original = target[name];
    if (typeof original !== 'function' || !MUTATING.test(name)) {
      continue;
    }
    const changed = args => {
      if (!name.startsWith('copy')) {
        report(args[0]);
      }
      if (DESTINATION.test(name)) {
        report(args[1]);
      }
    };
    target[name] = function (...args) {
      const last = args.length - 1;
      if (typeof args[last] === 'function') {
        const callback = args[last];
        args[last] = (...results) => {
          changed(args);
          callback(...results);
        };
        return original.apply(this, args);
      }
      let result;
      try {
        result = original.apply(this, args);
      } catch (error) {
        changed(args);
        throw error;
      }
      if (typeof result?.then === 'function') {
        return result.finally(() => changed(args));
      }
      changed(args);
      return result;
    };
  }
}
track(fs);
track(fs.promises);

// pi writes its session files through a descriptor.
const { openSync } = fs;
fs.openSync = function (file, flags, ...rest) {
  const fd = openSync.call(this, file, flags, ...rest);
  if (typeof flags === 'string' && /[wa+]/.test(flags)) {
    report(file);
  }
  return fd;
};

/**
 * pi also reads the JupyterLab files outside its tools, for example for the
 * preview of an edit: the host sets `fs.drive` to read `/drive` with the
 * contents API, and the shim applies the Node encoding option.
 */
for (const name of ['access', 'readFile']) {
  const local = fs.promises[name];
  fs.promises[name] = function (target, ...args) {
    const resolved = resolve(target);
    if (fs.drive && /^\/drive(\/|$)/.test(resolved ?? '')) {
      const result = fs.drive[name](resolved);
      const encoding =
        typeof args[0] === 'string' ? args[0] : args[0]?.encoding;
      return name === 'readFile' && encoding
        ? result.then(data => data.toString(encoding))
        : result;
    }
    return local.call(this, target, ...args);
  };
}

vol.fromJSON({
  '/pi/package.json': JSON.stringify({
    name: piPackage.name,
    version: piPackage.version,
    piConfig: piPackage.piConfig
  }),
  '/pi/README.md': readme,
  '/pi/dist/modes/interactive/theme/dark.json': JSON.stringify(darkTheme),
  '/pi/dist/modes/interactive/theme/light.json': JSON.stringify(lightTheme),
  ...Object.fromEntries(
    docs.keys().map(key => [`/pi/docs/${key.slice(2)}`, docs(key)])
  )
});
vol.mkdirSync('/tmp', { recursive: true });

module.exports = fs;
