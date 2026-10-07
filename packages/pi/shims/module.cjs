function notFound(id) {
  const error = new Error(`Cannot find module '${id}'`);
  error.code = 'MODULE_NOT_FOUND';
  return error;
}

function createRequire() {
  const load = id => {
    throw notFound(id);
  };
  load.resolve = load;
  return load;
}

module.exports = { createRequire };
