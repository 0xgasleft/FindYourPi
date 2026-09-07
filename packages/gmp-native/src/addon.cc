// Minimal native N-API addon wrapping real GMP for arbitrary-precision
// integer arithmetic. See package.json's description for why this exists
// (gmp-wasm's standard 32-bit WebAssembly build hits a hard 4GB linear-
// memory ceiling around ~125M decimal digits  -  docs/architecture.md §5.1).
//
// Values are wrapped as a real JS class (Mpz, Napi::ObjectWrap) backed by
// a native mpz_t, not passed around as hex/decimal strings between calls.
// This isn't just style: V8's own JS strings have a hard length ceiling
// (~2^29 characters, ~536M)  -  a real, different, THIRD ceiling hit while
// building this (measured directly: a ~200M-digit computation's largest
// intermediate value needed a ~590M-character hex string to round-trip
// through JS, past that limit  -  docs/architecture.md §5.1). Keeping every
// intermediate value as a native object and only ever materializing bytes
// for output (via writeDigits, straight into a pre-allocated Buffer  -  see
// below) sidesteps that ceiling entirely, for both intermediate values and
// the final billions-of-digits output. Mpz's lifetime is tied to normal JS
// garbage collection (Napi::ObjectWrap's destructor calls mpz_clear when
// the wrapping JS object is collected)  -  no manual free() to forget, the
// same way plain BigInt values were never manually freed in the original
// implementation.
#include <napi.h>
#include <gmp.h>
#include <cstring>
#include <cstdlib>
#include <string>

// TRIED AND REVERTED: overriding GMP's allocator (mp_set_memory_functions)
// to throw a C++ exception instead of returning NULL on failure, so an
// allocation failure would become a catchable JS error instead of GMP's
// default abort(). Reverted because it's genuinely unsafe on this
// toolchain: GMP's compiled code here is a separate DLL built by vcpkg
// (autoconf/MSYS2-driven, ultimately MSVC-compiled as plain C, not C++),
// and throwing a C++ exception through those call frames doesn't reliably
// unwind  -  confirmed directly, not assumed: it produced an even less
// diagnosable crash (no "Cannot allocate memory" message at all, just
// silent process death) than GMP's own default abort(). A real fix here
// would need a C-compatible mechanism (e.g. setjmp/longjmp around the
// risky call) rather than a C++ exception crossing an extern "C" boundary
// compiled by a toolchain that may not have generated unwind tables for
// it  -  not attempted given the correctness risk of getting that subtly
// wrong. GMP's default allocator (abort with a clear message) is kept.

class Mpz : public Napi::ObjectWrap<Mpz> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(
        env, "Mpz",
        {
            InstanceMethod("mul", &Mpz::Mul),
            InstanceMethod("add", &Mpz::Add),
            InstanceMethod("abs", &Mpz::Abs),
            InstanceMethod("sqrt", &Mpz::Sqrt),
            InstanceMethod("divTrunc", &Mpz::DivTrunc),
            InstanceMethod("writeDigits", &Mpz::WriteDigits),
            InstanceMethod("bitLength", &Mpz::BitLength),
            StaticMethod("powTen", &Mpz::PowTen),
        });
    Napi::FunctionReference *constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(ctor);
    env.SetInstanceData(constructor);
    exports.Set("Mpz", ctor);
    return exports;
  }

  // new Mpz() -> zero. new Mpz(hexString) -> parsed from hex (optional leading "-").
  Mpz(const Napi::CallbackInfo &info) : Napi::ObjectWrap<Mpz>(info) {
    Napi::Env env = info.Env();
    mpz_init(value_);
    if (info.Length() >= 1 && info[0].IsString()) {
      std::string hex = info[0].As<Napi::String>().Utf8Value();
      if (hex.empty() || mpz_set_str(value_, hex.c_str(), 16) != 0) {
        Napi::TypeError::New(env, "gmp-native Mpz: invalid hex integer string: \"" + hex + "\"").ThrowAsJavaScriptException();
      }
    }
    UpdateExternalMemory(env);
  }

  ~Mpz() {
    // V8's GC has no visibility into native memory a small JS wrapper
    // object secretly holds  -  a plain `new Mpz()` LOOKS like a tiny
    // object to V8's heuristics even while its mpz_t holds hundreds of MB
    // of native limb data, so GC doesn't run urgently just because native
    // memory is under pressure. AdjustExternalMemory (called here and in
    // UpdateExternalMemory below) is the standard, documented fix: it
    // tells V8's GC how many bytes this object is really responsible
    // for, which is what makes it collect dead intermediates promptly
    // enough during a long binarySplit recursion instead of letting
    // gigabytes of already-unreachable Mpz values pile up between
    // collections. Confirmed as the real cause here, not assumed: without
    // this, a 500M-digit run crashed (GMP's own "Cannot allocate memory",
    // an abort(), not a catchable JS exception) multiplying two ~270MB
    // operands  -  nowhere near actually exhausting available RAM  -  because
    // many already-dead prior intermediates from earlier in the same
    // recursion hadn't been collected yet.
    if (trackedBytes_ > 0) {
      Napi::MemoryManagement::AdjustExternalMemory(Env(), -static_cast<int64_t>(trackedBytes_));
    }
    mpz_clear(value_);
  }

  mpz_t &Value() { return value_; }

  // Called after every operation that can change this value's size
  // (construction from hex, and the result of every arithmetic op below).
  // See ~Mpz's doc for why this exists.
  void UpdateExternalMemory(Napi::Env env) {
    size_t bytes = static_cast<size_t>(mpz_size(value_)) * sizeof(mp_limb_t);
    int64_t delta = static_cast<int64_t>(bytes) - static_cast<int64_t>(trackedBytes_);
    if (delta != 0) {
      Napi::MemoryManagement::AdjustExternalMemory(env, delta);
      trackedBytes_ = bytes;
    }
  }

private:
  mpz_t value_;
  size_t trackedBytes_ = 0;

  static Mpz *UnwrapMpz(const Napi::Value &v) { return Napi::ObjectWrap<Mpz>::Unwrap(v.As<Napi::Object>()); }

  static Napi::Object NewWrapped(Napi::Env env) {
    Napi::Object obj = env.GetInstanceData<Napi::FunctionReference>()->New({});
    return obj;
  }

  Napi::Value Mul(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Object result = NewWrapped(env);
    Mpz *r = UnwrapMpz(result);
    mpz_mul(r->Value(), value_, UnwrapMpz(info[0])->Value());
    r->UpdateExternalMemory(env);
    return result;
  }

  Napi::Value Add(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Object result = NewWrapped(env);
    Mpz *r = UnwrapMpz(result);
    mpz_add(r->Value(), value_, UnwrapMpz(info[0])->Value());
    r->UpdateExternalMemory(env);
    return result;
  }

  Napi::Value Abs(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Object result = NewWrapped(env);
    Mpz *r = UnwrapMpz(result);
    mpz_abs(r->Value(), value_);
    r->UpdateExternalMemory(env);
    return result;
  }

  Napi::Value Sqrt(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (mpz_sgn(value_) < 0) {
      Napi::RangeError::New(env, "gmp-native Mpz.sqrt: negative value").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    Napi::Object result = NewWrapped(env);
    Mpz *r = UnwrapMpz(result);
    mpz_sqrt(r->Value(), value_); // truncated toward zero
    r->UpdateExternalMemory(env);
    return result;
  }

  Napi::Value DivTrunc(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Mpz *divisor = UnwrapMpz(info[0]);
    if (mpz_sgn(divisor->Value()) == 0) {
      Napi::RangeError::New(env, "gmp-native Mpz.divTrunc: division by zero").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    Napi::Object result = NewWrapped(env);
    Mpz *r = UnwrapMpz(result);
    mpz_tdiv_q(r->Value(), value_, divisor->Value()); // truncating division toward zero
    r->UpdateExternalMemory(env);
    return result;
  }

  // Writes `count` raw decimal digit VALUES (one byte each, 0-9  -  matching
  // this project's existing raw-digits.bin convention, NOT ASCII '0'-'9')
  // into `buffer` starting at buffer offset 0, reading from this number's
  // decimal expansion starting `skip` digits in (skip=1 to drop the
  // leading "3"  -  matches the project-wide position convention). Never
  // creates a JS string of the full value  -  mpz_get_str's result is a
  // plain C buffer (std::string/char*, no V8 length ceiling), and only the
  // requested slice gets copied out, byte by byte, into the caller's
  // pre-allocated Buffer. Returns the value's leading decimal digit as a
  // 1-character string (cheap, for the "must start with 3" sanity check
  // callers already do)  -  this is the one string this function produces,
  // deliberately tiny regardless of the value's real size.
  Napi::Value WriteDigits(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    Napi::Buffer<uint8_t> out = info[0].As<Napi::Buffer<uint8_t>>();
    int64_t skip = info[1].As<Napi::Number>().Int64Value();
    int64_t count = info[2].As<Napi::Number>().Int64Value();

    char *buf = mpz_get_str(nullptr, 10, value_);
    size_t len = std::strlen(buf);
    bool ok = static_cast<int64_t>(len) >= skip + count && skip >= 0;
    char leading = ok && len > 0 ? buf[0] : '\0';
    if (ok) {
      uint8_t *dst = out.Data();
      for (int64_t i = 0; i < count; i++) {
        dst[i] = static_cast<uint8_t>(buf[skip + i] - '0');
      }
    }
    void (*freeFunc)(void *, size_t);
    mp_get_memory_functions(nullptr, nullptr, &freeFunc);
    freeFunc(buf, len + 1);

    if (!ok) {
      Napi::RangeError::New(env, "gmp-native Mpz.writeDigits: not enough digits produced, or negative skip").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    return Napi::String::New(env, std::string(1, leading));
  }

  // Diagnostic/debugging aid: an approximate bit count, cheap and safe
  // regardless of scale (mpz_sizeinbase never materializes a string of
  // the whole value, unlike writeDigits  -  it's fine to call this on
  // values too large to ever safely stringify).
  Napi::Value BitLength(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    size_t bits = mpz_sizeinbase(value_, 2);
    return Napi::Number::New(env, static_cast<double>(bits));
  }

  // 10^exp via manual binary exponentiation (repeated squaring), NOT
  // mpz_ui_pow_ui: that GMP function takes `unsigned long` for the
  // exponent, which is 32 bits on Windows (LLP64)  -  it would silently wrap
  // for exponents past ~4.29 billion, exactly the range this project
  // targets (10B+ digit datasets need a ~10 billion exponent here). Manual
  // squaring only ever calls mpz_mul, which has no such limit  -  correct
  // for any exponent up to 2^64.
  static Napi::Value PowTen(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    double expD = info[0].As<Napi::Number>().DoubleValue();
    if (expD < 0) {
      Napi::RangeError::New(env, "gmp-native Mpz.powTen: exponent must be >= 0").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    unsigned long long exp = static_cast<unsigned long long>(expD);

    Napi::Object result = NewWrapped(env);
    Mpz *r = UnwrapMpz(result);
    mpz_set_ui(r->Value(), 1);

    mpz_t base;
    mpz_init_set_ui(base, 10);
    while (exp > 0) {
      if (exp & 1ULL) {
        mpz_mul(r->Value(), r->Value(), base);
      }
      exp >>= 1;
      if (exp > 0) {
        mpz_mul(base, base, base);
      }
    }
    mpz_clear(base);
    r->UpdateExternalMemory(env);
    return result;
  }
};

Napi::Object Init(Napi::Env env, Napi::Object exports) { return Mpz::Init(env, exports); }

NODE_API_MODULE(gmp_native, Init)
