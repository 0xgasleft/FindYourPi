import Link from "next/link";
import { fetchProfile } from "@/lib/api";
import { RarityBadge } from "../../components/rarity-badge";

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return { title: `${address.slice(0, 8)}... — Pi Hunter Profile` };
}

export default async function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const profile = await fetchProfile(address);

  return (
    <main className="min-h-screen bg-void-950 px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="text-sm text-neutral-400 hover:text-pi-gold">
          ← π Hunter
        </Link>

        <h1 className="mt-6 font-display text-2xl font-extrabold text-white">π Hunter</h1>
        <p className="mt-1 font-mono text-sm text-neutral-500">{profile.wallet_address}</p>

        {profile.stats ? (
          <>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Discoveries" value={profile.stats.total_discoveries} />
              <Stat label="Longest Match" value={`${profile.stats.longest_match} digits`} />
              <Stat label="Rarest" value={profile.stats.rarest_tier} />
              <Stat label="Furthest Position" value={profile.stats.furthest_position.toLocaleString()} />
            </div>

            {profile.achievements.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {profile.achievements.map((a) => (
                  <span
                    key={a.key}
                    className="clip-tag-sm border border-arcade-violet/50 bg-arcade-violet/20 px-3 py-1 font-mono text-xs font-bold uppercase text-violet-200"
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            )}

            <h2 className="mt-10 font-display text-sm font-bold uppercase tracking-wide text-pi-gold">Discoveries</h2>
            <div className="mt-4 space-y-3">
              {profile.discoveries.map((d) => (
                <Link
                  key={d.discovery_id}
                  href={`/discovery/${d.discovery_id}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-void-800/50 px-4 py-3 hover:border-pi-gold/40"
                >
                  <span className="font-mono text-neutral-100">{d.sequence}</span>
                  <span className="flex items-center gap-3 text-xs text-neutral-500">
                    position {d.position.toLocaleString()}
                    <RarityBadge tier={d.rarity_tier} />
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-8 text-neutral-500">No claimed discoveries yet.</p>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-void-800/50 p-4 text-center">
      <div className="font-mono text-xl font-bold text-white">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}
