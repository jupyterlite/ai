/**
 * Stand-in for Node modules that pi never calls in the browser.
 */
module.exports = new Proxy(
  { default: undefined },
  {
    get(target, property) {
      if (property === '__esModule') {
        return false;
      }
      if (property in target) {
        return target[property];
      }
      return function unsupported() {
        throw new Error(`${String(property)} is not available in the browser`);
      };
    }
  }
);
