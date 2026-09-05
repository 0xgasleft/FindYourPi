import Link from "next/link";
import { fetchLeaderboard } from "@/lib/api";

export const metadata = { title: "Leaderboard — Pi Hunter" };

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default async function LeaderboardPage() {
  const board = await fetchLeaderboard();

  return (
    <main className="min-h-screen bg-void-950 px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-neutral-400 hover:text-pi-gold">
          ← π Hunter
        </Link>
        <h1 className="mt-6 font-display text-3xl font-extrabold text-white">Leaderboard</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Ranked by skill and luck — longest match, rarest tier, furthest position, most discoveries. Never by
          spending.
        </p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          <Board title="Longest Match" entries={board.longest_match} render={(e) => `${e.match_length} digits — ${e.sequence}`} />
          <Board title="Rarest Discovery" entries={board.rarest} render={(e) => `${e.rarity_tier} — ${e.sequence}`} />
          <Board
            title="Furthest Position"
            entries={board.furthest_position}
            render={(e) => `position ${e.position?.toLocaleString()}`}
          />
          <Board title="Most Discoveries" entries={board.most_discoveries} render={(e) => `${e.count} discoveries`} />
        </div>
      </div>
    </main>
  );
}

function Board<T extends { owner_address: string }>({ title, entries, render }: { title: string; entries: T[]; render: (e: T) => string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-void-800/50 p-6">
      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-pi-gold">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">No claims yet — be the first.</p>
      ) : (
        <ol className="mt-4 space-y-2 text-sm">
          {entries.map((e, i) => (
            <li key={i} className="flex items-center justify-between">
              <Link href={`/profile/${e.owner_address}`} className="font-mono text-neutral-300 hover:text-pi-gold">
                #{i + 1} {short(e.owner_address)}
              </Link>
              <span className="font-mono text-neutral-500">{render(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
