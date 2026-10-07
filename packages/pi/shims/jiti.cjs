module.exports = {
  createJiti() {
    throw new Error(
      'Loading pi extensions from files is not supported in the browser'
    );
  }
};
