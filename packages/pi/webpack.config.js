/**
 * Let pi (written for Node) run in the browser: Node built-ins map to the
 * shims, a few pi modules are replaced, and the Node globals are provided to
 * the modules of this extension only.
 */
const fs = require('fs');
const path = require('path');
const {
  DefinePlugin,
  NormalModuleReplacementPlugin,
  ProvidePlugin
} = require('@rspack/core');

const shim = name => path.join(__dirname, 'shims', name);

/**
 * The exports map of pi-coding-agent hides its package folder, which holds
 * the files pi reads at run time (package.json, themes).
 */
function findPackageDir(name) {
  for (const base of require.resolve.paths(name) ?? []) {
    const candidate = path.join(base, name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  throw new Error(`Cannot find the ${name} package`);
}

const piPackageDir = findPackageDir('@earendil-works/pi-coding-agent');

const BUILTINS = {
  buffer: require.resolve('buffer/'),
  child_process: shim('child-process.cjs'),
  crypto: shim('crypto.cjs'),
  events: require.resolve('events/'),
  fs: shim('fs.cjs'),
  'fs/promises': shim('fs-promises.cjs'),
  http: shim('empty.cjs'),
  module: shim('module.cjs'),
  os: shim('os.cjs'),
  path: require.resolve('path-browserify'),
  perf_hooks: shim('perf-hooks.cjs'),
  process: shim('process.cjs'),
  readline: shim('readline.cjs'),
  'readline/promises': shim('readline.cjs'),
  stream: require.resolve('readable-stream'),
  string_decoder: require.resolve('string_decoder/'),
  'timers/promises': shim('timers-promises.cjs'),
  url: shim('url.cjs'),
  util: shim('util.cjs'),
  worker_threads: shim('empty.cjs'),
  zlib: shim('empty.cjs')
};

const PACKAGES = {
  'cross-spawn': shim('child-process.cjs'),
  jiti: shim('jiti.cjs'),
  'jiti/static': shim('jiti.cjs'),
  'pi-coding-agent-package': piPackageDir,
  'process/browser': shim('process.cjs'),
  'proper-lockfile': shim('lockfile.cjs'),
  undici: shim('undici.cjs')
};

const PI_DIST = /pi-coding-agent[\\/]dist[\\/]/;
const REPLACEMENTS = [
  [/[\\/]utils[\\/]photon\.js$/, shim('photon.js')],
  [/[\\/]utils[\\/]clipboard\.js$/, shim('clipboard.js')],
  [/[\\/]utils[\\/]tools-manager\.js$/, shim('tools-manager.js')],
  [/[\\/]utils[\\/]open-browser\.js$/, shim('open-browser.js')]
];

const timers = shim('node-timers.js');

module.exports = {
  node: { __dirname: 'mock' },
  resolve: {
    alias: { ...BUILTINS, ...PACKAGES }
  },
  module: {
    parser: { javascript: { url: false } },
    rules: [{ test: /photon_rs_bg\.wasm$/, type: 'asset/resource' }]
  },
  plugins: [
    new NormalModuleReplacementPlugin(/^node:/, resource => {
      const target = BUILTINS[resource.request.slice(5)];
      if (target) {
        resource.request = target;
      }
    }),
    new NormalModuleReplacementPlugin(PI_DIST, resource => {
      const data = resource.createData;
      if (!data?.resource || !PI_DIST.test(data.resource)) {
        return;
      }
      for (const [pattern, file] of REPLACEMENTS) {
        if (pattern.test(data.resource)) {
          data.resource = file;
          data.request = file;
          data.userRequest = file;
        }
      }
    }),
    new DefinePlugin({
      'import.meta.url': JSON.stringify('file:///pi/dist/index.js')
    }),
    new ProvidePlugin({
      Buffer: [require.resolve('buffer/'), 'Buffer'],
      setTimeout: [timers, 'setTimeout'],
      setInterval: [timers, 'setInterval'],
      clearTimeout: [timers, 'clearTimeout'],
      clearInterval: [timers, 'clearInterval'],
      setImmediate: [timers, 'setImmediate']
    })
  ],
  ignoreWarnings: [/Critical dependency/, /Failed to parse source map/]
};
