// Thin JS wrapper around the compiled native addon (build/Release/gmp_native.node).
// See src/addon.cc for what each function does and package.json for why this
// package exists instead of gmp-wasm.
const binding = require("./build/Release/gmp_native.node");

module.exports = {
  Mpz: binding.Mpz,
};
