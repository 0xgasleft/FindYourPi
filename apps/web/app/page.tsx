import Link from "next/link";
import { Hero3D } from "./components/hero-3d";
import { CornerBrackets } from "./components/corner-brackets";
import { PiHunt } from "./pi-hunt";

const STEPS = [
  { n: "01", title: "Enter", body: "A number, name, date, or phrase. Converted deterministically into digits  -  the exact method is documented, never a black box." },
  { n: "02", title: "Search π", body: "Checked against a versioned, chunked, Merkle-committed dataset of π's decimal expansion. A real search, every time  -  never fabricated." },
  { n: "03", title: "Claim", body: "Connect a wallet only when you're ready to mint. The contract independently re-verifies your proof  -  it never trusts a server's word for it." },
];

const STATS = ["500,000,000 DIGITS INDEXED", "CHUNK SIZE 128", "MERKLE COMMITTED", "ON-CHAIN VERIFIED", "π DATASET v2"];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-void-950">
      <header className="absolute inset-x-0 top-0 z-20 border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center border border-pi-gold/40 font-display text-sm font-bold text-pi-gold">
              π
            </span>
            <span className="font-display text-sm font-bold uppercase tracking-[0.25em] text-neutral-200">Hunter</span>
          </Link>
          <nav className="flex items-center gap-8 text-xs font-medium uppercase tracking-wide text-neutral-400">
            <a href="#how-it-works" className="transition hover:text-pi-gold">
              How it works
            </a>
            <Link href="/leaderboard" className="transition hover:text-pi-gold">
              Leaderboard
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="absolute inset-0">
          <Hero3D />
        </div>
        <div className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-void-950 to-transparent" />

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 pt-28 text-center">
          <span className="mb-6 border border-white/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-400">
            Every digit, cryptographically committed
          </span>

          <h1 className="animate-fade-up text-balance font-display text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl">
            Find your place in{" "}
            <span className="bg-gradient-to-br from-pi-gold to-arcade-magenta bg-clip-text text-transparent">π</span>
          </h1>
          <p className="mt-6 max-w-xl text-balance text-lg text-neutral-400">
            Enter anything. We&apos;ll search millions of digits of π to find where you belong.
          </p>

          <div className="relative mt-10 w-full max-w-xl border border-white/10 bg-void-900/70 p-8 backdrop-blur-md">
            <CornerBrackets />
            <PiHunt />
          </div>
        </div>

        <div className="relative z-10 overflow-hidden border-t border-white/5 py-4">
          <div className="flex w-max animate-marquee gap-12 whitespace-nowrap font-mono text-xs tracking-[0.2em] text-neutral-600">
            {[...STATS, ...STATS, ...STATS].map((s, i) => (
              <span key={i} className="flex items-center gap-12">
                {s}
                <span className="text-pi-gold/40">◆</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative mx-auto max-w-6xl scroll-mt-10 px-6 py-28">
        <h2 className="font-display text-xs font-bold uppercase tracking-[0.3em] text-pi-gold">How it works</h2>
        <p className="mt-3 max-w-lg text-balance text-neutral-500">
          You don&apos;t own π or the sequence itself. A claimed discovery is a blockchain token representing a
          specific, verified occurrence in it  -  a collectible, not an investment.
        </p>

        <div className="mt-12 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="bg-void-950 p-8">
              <div className="font-mono text-xs text-pi-gold/60">{step.n}</div>
              <div className="mt-3 font-display text-xl font-bold text-white">{step.title}</div>
              <p className="mt-3 text-sm text-neutral-500">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-8 text-center text-xs text-neutral-600">
        Pi Hunter is an early work in progress. Nothing here is financial advice, and NFTs represent collectibles,
        not investments.
      </footer>
    </main>
  );
}
