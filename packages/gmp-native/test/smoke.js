// Plain-Node smoke test (no vitest  -  this package has no TS build step to
// run under, and needs to work even before the rest of the monorepo's
// tooling is trusted). Run via `pnpm test` after a successful `node-gyp
// rebuild`.
const assert = require("node:assert");
const { Mpz } = require("../index.js");

// Reads `count` decimal digit bytes starting `skip` digits into mpz's
// decimal expansion, returning them as a plain decimal string (test-only
// convenience  -  production code never materializes a whole huge value
// this way, only small verification slices like this).
function digitsOf(mpz, count, skip = 0) {
  const buf = Buffer.alloc(count);
  const leading = mpz.writeDigits(buf, skip, count);
  let s = "";
  for (let i = 0; i < count; i++) s += String(buf[i]);
  return { leading, slice: s };
}

function check(name, actual, expected) {
  assert.strictEqual(actual, expected, `${name}: expected ${expected}, got ${actual}`);
  console.log(`ok - ${name}`);
}

// mul: 0xff * 0x10 = 4080
{
  const r = new Mpz("ff").mul(new Mpz("10"));
  const { leading, slice } = digitsOf(r, 4);
  check("mul(ff,10) leading digit", leading, "4");
  check("mul(ff,10) full value", slice, "4080");
}

// add: 255 + 1 = 256
{
  const r = new Mpz("ff").add(new Mpz("1"));
  const { leading, slice } = digitsOf(r, 3);
  check("add(ff,1) leading digit", leading, "2");
  check("add(ff,1) full value", slice, "256");
}

// abs(-0xff) = 255
{
  const r = new Mpz("-ff").abs();
  check("abs(-ff)", digitsOf(r, 3).slice, "255");
}

// powTen(3) = 1000
{
  const r = Mpz.powTen(3);
  check("powTen(3)", digitsOf(r, 4).slice, "1000");
}

// sqrt(100) = 10, truncated: sqrt(101) also = 10
{
  check("sqrt(100)", digitsOf(new Mpz((100).toString(16)).sqrt(), 2).slice, "10");
  check("sqrt(101) truncates to 10", digitsOf(new Mpz((101).toString(16)).sqrt(), 2).slice, "10");
}

// divTrunc: 100/10=10; 7/2=3 (truncated, not rounded)
{
  check("divTrunc(100,10)", digitsOf(new Mpz((100).toString(16)).divTrunc(new Mpz((10).toString(16))), 2).slice, "10");
  check("divTrunc(7,2) truncates toward zero", digitsOf(new Mpz((7).toString(16)).divTrunc(new Mpz((2).toString(16))), 1).slice, "3");
}

// Negative division result: sign preserved (buf[0] of mpz_get_str is '-' for negatives, so skip=1 lands on the first magnitude digit).
{
  const r = new Mpz((-7).toString(16)).divTrunc(new Mpz((2).toString(16)));
  const buf = Buffer.alloc(1);
  const leading = r.writeDigits(buf, 1, 1); // skip the '-' sign char, read 1 magnitude digit
  check("divTrunc(-7,2) sign", leading, "-");
  check("divTrunc(-7,2) magnitude first digit", String(buf[0]), "3");
}

// A number too large for native BigInt's 2^30-1 bit ceiling (~323M decimal
// digits) AND too large for a single JS string (V8's ~536M character
// limit)  -  the whole point of this redesign. 700M decimal digits needs
// ~2.33 billion bits  -  past BOTH ceilings.
{
  const bigExp = 700_000_000;
  const r = Mpz.powTen(bigExp);
  const buf = Buffer.alloc(1000);
  const leading = r.writeDigits(buf, 1, 1000); // skip the leading "1", read the next 1000 digits (should all be "0")
  check(`powTen(${bigExp.toLocaleString()}) leading digit`, leading, "1");
  let allZero = true;
  for (let i = 0; i < 1000; i++) if (buf[i] !== 0) allZero = false;
  assert.ok(allZero, `powTen(${bigExp}) should be 1 followed by all zeros`);
  console.log(`ok - powTen(${bigExp.toLocaleString()}) produces a correct value past both the native-BigInt bit ceiling and V8's string-length ceiling`);
}

console.log("\nAll gmp-native smoke tests passed.");
