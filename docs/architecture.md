# Architecture Overview  -  Pi Hunter

Companion documents: `docs/threat-model.md` (what can go wrong and why it's
mitigated), `docs/proof-system.md` (the on-chain verification design in
depth), `docs/rarity.md` (rarity tiers vs. what's actually discoverable in
the current dataset). This document covers the system as a whole and the
decisions made to get from the spec product requirements to a buildable plan.

## 1. Component map

```text
apps/web        Next.js frontend  -  search UX, wallet flow, discovery/profile/
                 leaderboard pages, OG image generation
apps/api         Search API, conversion, discovery/claim/proof endpoints,
                 rate limiting, auth-free by design (wallet only needed at claim time)
apps/indexer     Chain event indexer (DiscoveryClaimed, Transfer) -> Postgres,
                 reorg-safe, idempotent
apps/admin       Protected dashboard: dataset status, health, pause controls

packages/contracts   PiHunterNFT (ERC-721), PiDatasetRegistry, MerkleVerifierV1
                 (immutable, versioned per dataset  -  no upgradeable verifier)
packages/pi-core     Canonical conversion algorithms, discoveryId derivation,
                 rarity tiers  -  single source of truth, imported by web/api/contracts tests
packages/pi-search   Search engine: dataset ingestion, indexing, substring search
packages/proofs      Merkle chunk proof construction + a *standalone* verifier
                 (no dependency on apps/api)  -  the "don't trust our server" escape hatch
packages/types       Shared TS types / generated contract ABIs
packages/ui          Shared component primitives
packages/config      Shared eslint/tsconfig/tailwind config

infrastructure/docker      Postgres, api, indexer, web services for local dev
infrastructure/terraform   Production infra (deferred until MVP functional)
docs/                      This file, threat-model.md, proof-system.md, runbooks
```

## 2. Data flow (search → claim)

```text
user input
  -> pi-core: normalize + convert (number / ASCII / UTF-8 / SHA-256 modes)
  -> apps/api /api/search
       -> pi-search: substring search over canonical dataset (cached)
       -> response: { found, position, matchLength, occurrenceCount, ... }
  -> apps/web: reveal animation, rarity tier, "Claim this discovery"
  -> user connects wallet
  -> apps/api /api/proof: given (datasetVersion, position, matchLength),
       packages/proofs builds the Merkle chunk proof (chunk data + sibling
       hashes) against the *currently registered* root
  -> apps/web: wallet submits contracts.claim(datasetVersion, position,
       sequence, proofs) directly to the chain (not proxied through the API)
  -> PiProofVerifier re-derives the proof on-chain; PiHunterNFT checks
       discoveryId unclaimed, mints, emits DiscoveryClaimed
  -> apps/indexer picks up the event, writes discoveries/claims/nfts rows
  -> apps/web /discovery/[id]: reads indexed state, renders public page + OG image
```

The critical property: the claim transaction's *inputs* are exactly what the
contract needs to verify from scratch. The API's `/api/proof` endpoint is a
convenience for constructing calldata, not a trust boundary  -  the contract
does not call back into the API, and `packages/proofs` is deliberately
usable standalone (given only a copy of the public dataset and chunk files)
so a user or auditor never has to trust our backend to submit a valid claim.

## 3. Chain selection

Requirement (spec §11): evaluate, don't hardcode. Candidates considered:
Base, Optimism, Arbitrum, Polygon PoS.

Chosen for MVP: **Base** (OP-Stack L2).

* Gas cost: sub-cent for the calldata-heavy `claim()` transaction profile in
  `docs/proof-system.md` §4  -  comparable to other OP-Stack/Arbitrum L2s,
  cheaper than Polygon PoS's current fee volatility.
* NFT/wallet tooling: first-class support in viem/wagmi, broad wallet
  coverage (Coinbase Wallet, MetaMask, WalletConnect), mature block
  explorer (Basescan) for the public verification page (§38).
* RPC reliability: multiple public/paid providers, no single point of
  failure requirement for MVP.
* Ecosystem/long-term viability: active L2 with continued roadmap
  investment; reasonable bet for a consumer-facing collectible app.
* This is not a hardcoded assumption in code  -  `CHAIN_ID`, `RPC_URL`, and
  contract addresses are all environment-driven (see `.env.example`), so
  redeploying to another OP-Stack or generic EVM chain is a config change,
  not a rewrite.

## 4. π search engine approach

Requirement (spec §6): fast substring search, not naive `LIKE`. Chosen
approach for MVP scale (first ~1B digits): an **FM-index (BWT-based)** built
once at ingestion time, memory-mapped rather than loaded fully into process
memory. Rationale vs. alternatives:

* **Suffix array (plain)**: simpler to build than FM-index, O(n) space at
  ~4-8 bytes/digit  -  for 1B digits that's 4-8GB, workable but memory-heavy
  per instance and doesn't compress well.
* **FM-index**: compressed (close to entropy of the digit alphabet, size
  10), supports O(m log n) substring search, memory-mappable for
  horizontal scaling without duplicating gigabytes of RAM per replica.
  **Chosen**  -  matches the spec's explicit requirement to avoid loading the
  full dataset into memory unnecessarily and to support horizontal scaling.
* **Naive scan / SQL LIKE**: explicitly excluded by the spec; doesn't scale
  past a few million digits at interactive latency.

Popular queries (repeated searches for common numbers/words) are cached
(short numeric sequences especially  -  birthdays, `123456`, etc.  -  will be
hot keys) in front of the index. Benchmarking (spec §33) validates this
choice empirically before locking it in; if FM-index build/query times don't
meet targets at 1B digits, the fallback is a suffix-array-on-disk with
memory-mapped access as the simpler alternative  -  both are compatible with
the same chunked-Merkle proof layer, since proof construction only needs
random access to raw digits at a known position, not the index structure
itself.

## 5. Dataset provenance

Digits sourced from a reproducible generation process (spigot/Chudnovsky
algorithm implementation) rather than an unverifiable third-party file,
specifically so the "anyone can regenerate and check the root" property in
`docs/threat-model.md` T3 is real and not just theoretical. The generation
script, parameters, and resulting chunked dataset are versioned artifacts
checked into (or referenced by) the repo, not a one-off manual step.

**Revised on review: independent verification ships in MVP, not Phase 3.**
The decentralization roadmap originally scheduled public dataset download
and independent verifier tooling for Phases 2–3. On review this was judged
too fundamental to the project's core trust claim to defer  -  a "don't trust
our server" architecture whose only verification tool is unpublished doesn't
earn that claim yet. Phase 2 (π engine, §7 below) therefore now includes, as
in-scope MVP deliverables, not later phases:

* the generation algorithm's exact source code and parameters, published;
* the full chunked dataset, published (static file, not just an API);
* `datasetHash` and `root` recorded together so either can be checked
  against the other;
* an `independent-verify` script that regenerates the digits from the
  published algorithm and recomputes the Merkle root standalone (no
  dependency on `apps/api` or any of this project's running infrastructure);
* a short reproducibility doc walking a third party through running it.

Phases 2–3 of the decentralization roadmap (spec §39) now read as "make this
easier and more widely mirrored," not "make this possible for the first
time."

### 5.1 Scaling generation: what actually dominates the time, and a hard ceiling

The first v1 dataset (50,000,000 digits) was generated single-threaded in
~4 minutes and later superseded by the current, larger v1 dataset (see
below). Single-threaded generation scales roughly as O(n^1.2) empirically
(measured: 1M→2.2s, 10M→37.5s, 50M→255s).

An initial attempt to scale this to "the full documented trillion decimals"
was made and **failed outright**  -  not for a performance reason, but a hard
one: at 1 billion digits, `computePiDigits` throws
`RangeError: Maximum BigInt size exceeded`. This section documents what that
error actually is, where the real ceiling sits, and why v1's target dataset
size is **80,000,000 digits**, not billions or trillions.

**V8's native `BigInt` has a hard limit: exactly `2^30 - 1` bits
(1,073,741,823 bits, ≈323M decimal digits for a single value)  -  confirmed
directly** (`1073741823n << 1n` succeeds, `1073741824n << 1n` throws). This
is a JS engine limit, not a bug in this codebase or a tunable setting, and it
binds long before the previously-documented Int32Array/memory ceiling further
below ever would.

The naive assumption  -  "the output is only 1B digits, well under the ~323M
single-value limit's... wait, that's already smaller"  -  undersells how much
bigger the *internal* arithmetic gets relative to the final digit count.
Chudnovsky binary splitting's `Q(0,n)` (the product accumulated across all
`n` terms) is `(640320³/24)^(n-1) × ((n-1)!)³`  -  its bit length is
`(n-1)·log2(640320³/24) + 3·log2((n-1)!)`, which grows roughly as
`n·log(n)`, not linearly with the digit count it ultimately produces (each
term's constant grows with the term index, so later terms contribute
disproportionately more bits than earlier ones). Worse, `Q` isn't even the
final binding constraint: the closing step in `digitsFromPQT` computes
`Q * 426880n * sqrtC`, a numerator that adds `sqrtC`'s own size (roughly
`numDigits × log2(10)` bits) on top of `Q`'s already-superlinear bit length,
before dividing back down. That numerator is what actually overflows first.

This was worked out with a closed-form fit (Stirling's approximation for the
factorial term), calibrated against one real measured data point
(`Q` at 7,051,368 terms → 826,424,984 bits, matched by the formula to 3×10⁻⁸
relative error), then confirmed with real, full `computePiDigits` runs  -  not
just the binary-splitting step in isolation (see
`packages/pi-search/scripts/probe-bigint-ceiling.ts` and
`probe-full-ceiling.ts`):

| digits | result | time |
|---|---|---|
| 50,000,000 | OK (original v1) | ~255s |
| 80,000,000 | OK | 390.2s |
| 92,000,000 | OK | 485.4s |
| 95,000,000 | **FAILS** (`Maximum BigInt size exceeded`) |  -  |

The closed form's predicted failure boundary (~92,855,674 digits) landed
exactly between the last-OK and first-FAIL measurements. **v1 targets
80,000,000 digits**  -  ~14% below the real, measured failure point as a
safety margin, not a round number picked arbitrarily. Going past ~93M digits
is not a "wait longer" problem; it needs arbitrary-precision digit-array
arithmetic instead of native `BigInt` (effectively reimplementing the parts
of a bignum library V8 doesn't expose), which is a much larger rewrite than
this project's scope justified.

Two levers were evaluated for scaling *time* (as opposed to the hard digit
ceiling above) without leaving a laptop, and profiling before committing to
either paid off  -  the obvious one doesn't work:

* **Parallelizing binary splitting's recursion across CPU cores.** The term
  range for a `binarySplit(0, nTerms)` call splits naturally into K
  independent subranges, each computable by an ordinary, unmodified
  `binarySplit` call in its own worker thread, folded back together with a
  *balanced pairwise tree* of the same combine step the recursion already
  uses internally (a naive left-to-right fold was tried first and measured
  worse than single-threaded  -  folding must stay balanced, or you're back to
  the O(n²)-ish cost binary splitting exists to avoid). This is implemented
  and correctness-tested (`packages/pi-search/src/parallel-pi-generator.ts`,
  `test/parallel-pi-generator.test.ts`  -  byte-for-byte identical output to
  the single-threaded reference at multiple worker counts, on a 24-core
  machine). **Measured result: net *slower* than single-threaded at 50M
  digits** (253s vs 225s) even after the balanced-fold fix. Profiling
  (`packages/pi-search/scripts/bench-generation-breakdown.ts`) explains why:
  at 50M digits, `binarySplit` itself is only ~55s of the total  -  the other
  ~200s (over 70%) is the final `isqrt` (Newton's method square root on the
  ~100M-decimal-digit scaled value needed for the closing 426880·√10005
  term), which the parallelization never touches. Parallelizing the ~20% of
  the work that isn't the bottleneck, while adding worker-spawn and
  cross-thread BigInt-serialization overhead, is a net loss. The module is
  kept (it's correct, tested, harmless) but **not used by
  `scripts/generate-dataset.ts`**, which calls the plain single-threaded
  `computePiDigits` instead.
* **The real fix  -  recursive increasing-precision Newton for `isqrt`**  -
  is a known, standard technique (each Newton iteration only needs enough
  precision to double the correct bits from the previous step; using the
  full ~100M-digit value on every iteration, as the current
  `packages/pi-search/src/isqrt.ts` does, means ~25-28 full-precision
  divisions where only the last 1-2 actually need full size). This would
  plausibly cut total generation time by an order of magnitude, but **would
  not raise the hard BigInt-size ceiling above**  -  it only affects how long
  generation takes below that ceiling. **Not implemented**: it requires
  careful precision/scaling bookkeeping, and a subtle bug would silently
  produce wrong digits rather than an obvious failure  -  not a risk worth
  taking on the one computation that determines every claim's ground truth,
  without a much larger correctness-testing investment than this pass had
  budget for. Documented here as the legitimate next lever, deliberately
  deferred.

**A second, looser ceiling exists below the BigInt one and is now moot in
practice, but is documented for completeness.**
`packages/pi-search/src/suffix-array.ts` stores positions in an `Int32Array`
 -  this silently overflows past `2,147,483,647` digits, over 23x v1's actual
80M-digit target and also past the ~93M BigInt ceiling above, so it is never
actually reached by this codebase as it stands today. It would only become
relevant again if `computePiDigits` were ever rewritten with
arbitrary-precision arithmetic to lift the BigInt ceiling  -  at which point
this Int32Array limit (and the fully-in-memory loading strategy's ~5.5
bytes/digit steady-state cost) would become the next real constraint, and
would need the same widened-index-type / disk-backed-index fix already
anticipated in §4 above. `scripts/generate-dataset.ts` enforced the real
(lower, BigInt-derived) ceiling explicitly at the time.

### 5.1.1 Update: real native GMP, four more ceilings, and 500,000,000 digits

Everything above was superseded by rewriting the arithmetic core to use real
GMP instead of native `BigInt`  -  not to go slightly further, but because
the user asked, directly, for "at least 1B, preferably 10B and beyond,"
which the ~93M-digit BigInt ceiling had no path to. What follows is the
measured, not assumed, record of what that actually took: **four more
distinct ceilings**, each a real, reproducible failure with a concrete
cause, before landing on a validated, working **500,000,000-digit v2
dataset**  -  still short of 1B, for a reason documented at the end that is
genuinely not fixable with more code.

**Ceiling #2  -  gmp-wasm's WebAssembly linear memory (~125M digits).**
`gmp-wasm` (GMP compiled to standard 32-bit WebAssembly) was tried first: it
genuinely fixed the BigInt ceiling and its low-level ops measured *faster*
than native BigInt. But standard WASM linear memory is capped at 4GB by
spec, regardless of real system RAM  -  confirmed directly: 120,000,000
digits succeeded at 3.93GB peak; 125,000,000+ failed consistently with the
same WASM-level fatal error, on a machine with 12GB+ genuinely free.
Along the way, two real *performance* bugs were found and fixed in the
gmp-wasm implementation (both moot once native GMP replaced it, kept here
because the underlying lessons generalize): a shared GMP context letting
dead intermediates pile up, repeatedly triggering full-copy WASM memory
growth (fixed with short-lived per-operation scopes); and V8's native
`BigInt.prototype.toString(10)` being O(n²) for huge numbers, discovered by
directly measuring a single step take ~86s from decimal round-tripping
alone (fixed by using hex, which is O(n)).

**Ceiling #3  -  V8's own JS string length limit (~536M characters,
`2^29`-ish).** Even after fixing gmp-wasm's WASM ceiling, a **~200M-digit**
computation's largest intermediate value needed a ~590M-character hex
string to round-trip between native code and JS  -  past V8's own string
length ceiling, a JS-engine limit that applies **regardless of WASM vs.
native**, confirmed directly (`Array.from`/string conversions on values
this size throw independent of which backend produced them). This is why
`packages/gmp-native`'s `Mpz` class never materializes a JS string for an
intermediate value at all: every operation stays as a native, GC-managed
object end to end, and the only place a decimal string is required  -  the
very last step  -  writes raw digit bytes straight into a pre-allocated
`Buffer`/`Uint8Array` instead of ever building one giant JS string. This is
also why `computePiDigits` returns a `Uint8Array` (one raw digit value per
byte), not a `string`: for any dataset size past ~536M digits, the
*finished output* couldn't be a single JS string either.

**The pivot to real native GMP.** `packages/gmp-native` is a small N-API
addon linking actual GMP (built via vcpkg on Windows, matching MSVC  -  the
same toolchain Node.js itself is built with, to avoid CRT mismatches; via
`apt install libgmp-dev` on Linux). The obvious existing npm package,
`mpzjs`, was ruled out immediately  -  its own README states "It doesn't work
in Windows now." A real native (not WASM) addon has no WASM memory ceiling
at all (real native code, real 64-bit address space) and, once every
operation's external memory usage is reported to V8 via
`Napi::MemoryManagement::AdjustExternalMemory` (a small JS wrapper object
secretly holding hundreds of MB of native `mpz_t` data looks *tiny* to V8's
GC heuristics otherwise, so collection wasn't happening urgently enough  -
this was a real, measured bug of its own, fixed the same way any native
addon holding externally-allocated memory needs to), correctness held at
every scale tested. One thing was tried and deliberately reverted: making
GMP's own allocation failures a catchable JS error (overriding
`mp_set_memory_functions` to throw instead of `abort()`)  -  reverted because
throwing a C++ exception through GMP's compiled-as-C stack frames doesn't
reliably unwind on this toolchain (it produced an *even less* diagnosable
crash than the plain `abort()`), and shipping that risk wasn't worth it for
a cosmetic improvement.

**Ceiling #4  -  Windows' CRT allocator can't serve certain large single
allocations, independent of free RAM.** Real native GMP still crashed past
~350-400M digits on Windows  -  not a math or memory-availability problem
(12GB+ was free at the time) but `GNU MP: Cannot allocate memory` from a
single ~4.29GB allocation request, reproducible at the *exact* same size
across multiple runs regardless of what else had or hadn't been allocated
first (ruling out fragmentation-from-this-process-history as the cause).
Confirmed as Windows-specific, not GMP- or math-specific, by direct
reproduction: the identical multiplication (two ~2.1-2.2-billion-bit
operands, built via `Mpz.powTen` to avoid the string ceiling above) that
crashes on Windows completes in **11 seconds on Linux (WSL2)**, on the same
physical machine. The real, full Chudnovsky algorithm was then validated
end-to-end at 500,000,000 digits on WSL2  -  correct output, 977s, 11.97GB
peak  -  confirming the fix generalizes, not just the isolated repro.

**Ceiling #5  -  V8's plain-Array length limit, then a separate "huge
TypedArray" restriction, in `suffix-array.ts`.** Getting the *real*
`generate-dataset.ts` pipeline (not just digit generation) working at 500M
digits surfaced two more V8 limits, both in the suffix array construction's
sort step, which used to convert to a plain JS `Array` before sorting
(`Array.prototype.sort` optimizes custom comparators much better than
`TypedArray.prototype.sort`  -  true, but irrelevant once neither path
works). Confirmed directly: `Array.from(new Int32Array(100_000_000))`
succeeds; the same call at `200_000_000` throws `RangeError: Invalid array
length`, regardless of available memory. The seemingly-obvious fallback  -
sort the `Int32Array` in place with the same custom comparator  -  hits a
*different* wall: `TypeError: Custom comparefn not supported for huge
TypedArrays`. Both were replaced with a **stable counting sort** (two
passes per prefix-doubling round, by secondary key then primary key): our
sort keys are exactly the small-bounded-integer case counting sort is built
for, it's O(n) instead of O(n log n) per pass, and  -  the actual point  -  it
never calls a comparator-accepting sort at all, so neither V8 restriction
applies. Validated directly at 500,000,000 random elements (620.7s,
correctly sorted, 10.57GB peak) before trusting it in the real pipeline.

**One more mundane but real blocker: V8's default heap limit (~4GB) is not
system memory.** Both `apps/api`'s dataset loader and
`scripts/generate-dataset.ts`'s merkle/suffix-array steps hit `JavaScript
heap out of memory` well before the ~20GB the 500M-digit dataset actually
needs  -  V8's *default* old-space limit, not a hardware ceiling. Fixed with
`NODE_OPTIONS='--max-old-space-size=<N>'`; see that flag's use in
`generate-dataset.ts`'s own usage comment and in `apps/api`'s dev/start
scripts.

**Final, validated result: v2 = 500,000,000 digits.** Generated end-to-end
on WSL2 (17:31 digits + 3s chunk/pack + 1:52 merkle + 22:15 suffix array
≈ 42 minutes total, 20.51GB peak), correctness confirmed against the known
π reference prefix, against the previously-verified v1 dataset's shared
prefix, and via the suffix array's own full sortedness invariant (not just
spot-check queries).

**Why not 1B, if the goal was "at least 1B, preferably 10B"?** 1B digits
was attempted for real, twice, on this machine (24GB allocated to WSL2, out
of 31GB total host RAM)  -  both attempts were killed by the OOM killer, not
by any of the five ceilings above. Digit generation alone for 1B needs more
than 24GB before chunking/Merkle/suffix-array even start stacking further
memory on top. This is a **genuine physical RAM limit on this specific
machine**, not a bug  -  every one of the five ceilings actually chased down
in this investigation had a real code-level fix; this one doesn't, short of
more RAM. The correct, already-identified path past it (not attempted, by
the user's own choice, given the added cost/complexity for a one-time task)
is a temporary cloud VM with more RAM (64-128GB) for an hour or two, running
this exact same, already-validated code  -  since dataset generation is a
one-time step whose *output* (not the generation environment) is what the
running app actually depends on.

## 6. Testing strategy

Per spec §32, three layers, mapped onto the components above:

* **Unit**: `pi-core` conversion/discoveryId/rarity (property-tested against
  the documented spec  -  same digit in, same output, always); `pi-search`
  correctness against a small known-digits fixture; `proofs` Merkle
  construction/verification round-trips; contract unit tests (mint,
  duplicate claim, invalid proof, invalid dataset version, ownership,
  events) plus fuzz tests on `verifyOccurrence` (malformed proofs, off-by-one
  offsets, wrong chunk order).
* **Integration**: the full input → conversion → search → proof →
  contract-verification → mint → indexer → public page path, run against a
  local chain (Anvil/Hardhat) and a small real π dataset slice.
* **E2E**: Playwright over the actual UI flow (§32), gated behind Phase 9
  (Hardening) once the product surface is stable enough to be worth
  locking down with browser tests.

## 7. Build order

Following spec §53 as-is: Foundation → π engine → Core product (search UX
without claiming) → Smart contract → Proof system → NFT metadata/artwork →
Social → Gamification → Hardening. The proof system (this document's core
subject) lands in Phase 5, but its *design* is fixed now, before Phase 1
code, specifically so the discoveryId/serialization/chunking decisions don't
have to be revisited or migrated later  -  they're shared, load-bearing
contracts between `pi-core`, `packages/contracts`, and `packages/proofs`
from day one.

## 8. Open engineering decisions made without further input (spec §57 rule 10)

* Chunk size 128 digits packed 4-bit/digit, max on-chain-provable match
  length 64 digits  -  benchmarked, not assumed; see `docs/proof-system.md`
  §3.1 and §4.
* Chain: Base for MVP, config-driven.
* Search index: FM-index, to be confirmed/adjusted after benchmarking.
* Verifier upgrade path: immutable, versioned verifier contracts per dataset
  version, not a swappable/upgradeable module  -  see `docs/proof-system.md`
  §3.6.
* Front-running: optional `commitClaim`/`revealClaim` path shipped alongside
  direct `claim()` from day one, used above a configurable rarity threshold
   -  see `docs/proof-system.md` §3.7.
* Dataset generation: self-computed via a reproducible algorithm rather than
  an externally sourced file, for provenance reasons (§5 above); the
  regeneration/verification script ships in MVP, not deferred.
* Rarity UX: theoretical tier is shown separately from what's realistically
  discoverable in the currently indexed range  -  see `docs/rarity.md`.

These are documented decisions, not open questions  -  flag if any should be
revisited before Phase 1 begins.
