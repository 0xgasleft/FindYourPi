import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchDiscovery } from "@/lib/api";
import { RarityBadge } from "../../components/rarity-badge";
import { CornerBrackets } from "../../components/corner-brackets";

const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS;
const EXPLORER_BASE = process.env.NEXT_PUBLIC_CHAIN_ID === "8453" ? "https://basescan.org" : "https://sepolia.basescan.org";

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const discovery = await fetchDiscovery(id);
  if (!discovery) return { title: "Discovery not found — Pi Hunter" };

  const title = `${discovery.sequence} — Found at position ${discovery.position.toLocaleString()} in π`;
  const description = "Discover your place in the digits of π.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DiscoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const discovery = await fetchDiscovery(id);
  if (!discovery) notFound();

  const shareUrl = `https://pihunter.example/discovery/${discovery.discovery_id}`;
  const shareText = `I found ${discovery.sequence} at position ${discovery.position.toLocaleString()} in π. Find yours →`;

  return (
    <main className="relative min-h-screen bg-void-950 px-6 py-16">
      <div className="grid-backdrop pointer-events-none fixed inset-0" />
      <div className="relative mx-auto max-w-xl">
        <Link href="/" className="text-sm text-neutral-400 hover:text-pi-gold">
          ← π Hunter
        </Link>

        <div className="relative mt-8 border border-white/10 bg-void-800/60 px-8 py-10 text-center backdrop-blur">
          <CornerBrackets />
          <div className="font-display text-sm font-bold uppercase tracking-[0.2em] text-pi-gold">Discovery Verified</div>
          <div className="mt-4 font-mono text-5xl font-bold text-white">{discovery.sequence}</div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-left text-sm">
            <Field label="Position" value={discovery.position.toLocaleString()} />
            <Field label="Match Length" value={`${discovery.match_length} digits`} />
            <Field label="π Dataset" value={`Pi v${discovery.pi_dataset_version}`} />
            <Field label="Conversion" value={discovery.conversion_method} />
          </div>

          <div className="mt-6 flex justify-center">
            <RarityBadge tier={discovery.rarity_tier} />
          </div>

          <div className="mt-8 border-t border-white/10 pt-6 text-left text-sm">
            {discovery.claimed ? (
              <>
                <Field label="Status" value="CLAIMED" />
                <Field label="NFT" value={`#${discovery.token_id}`} />
                {discovery.owner_address && <Field label="Owner" value={short(discovery.owner_address)} />}
                {NFT_CONTRACT_ADDRESS && discovery.token_id !== null && (
                  <a
                    href={`${EXPLORER_BASE}/token/${NFT_CONTRACT_ADDRESS}?a=${discovery.token_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-pi-gold underline"
                  >
                    View on block explorer →
                  </a>
                )}
              </>
            ) : (
              <div className="text-center text-neutral-400">
                <span className="clip-tag-sm mr-2 border border-arcade-violet/50 bg-arcade-violet/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-arcade-cyan">
                  Unclaimed
                </span>
                Someone could claim this discovery first.
              </div>
            )}
          </div>

          <p className="mt-6 text-xs text-neutral-500">
            You do not own π or this sequence itself. A claimed discovery is a blockchain token representing a
            specific, cryptographically verified occurrence — a collectible, not an investment.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noreferrer"
            className="clip-tag-sm border border-white/15 px-4 py-2 text-xs font-medium text-neutral-300 hover:border-pi-gold/50 hover:text-pi-gold"
          >
            Share on X
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noreferrer"
            className="clip-tag-sm border border-white/15 px-4 py-2 text-xs font-medium text-neutral-300 hover:border-pi-gold/50 hover:text-pi-gold"
          >
            Share on Telegram
          </a>
          <Link href="/" className="clip-tag-sm border border-pi-gold bg-pi-gold px-4 py-2 text-xs font-bold uppercase text-void-950 hover:bg-pi-amber">
            Find your place in π
          </Link>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="font-mono text-neutral-100">{value}</div>
    </div>
  );
}
