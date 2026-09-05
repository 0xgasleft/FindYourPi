const TIER_STYLES: Record<string, string> = {
  COMMON: "border-neutral-600 bg-neutral-700/40 text-neutral-200",
  UNCOMMON: "border-emerald-600 bg-emerald-700/30 text-emerald-200",
  RARE: "border-sky-600 bg-sky-700/30 text-sky-200",
  EPIC: "border-arcade-violet bg-arcade-violet/25 text-violet-100",
  LEGENDARY: "border-pi-gold bg-pi-amber/20 text-pi-gold",
  MYTHIC: "border-arcade-magenta bg-arcade-magenta/25 text-pink-100",
};

export function RarityBadge({ tier }: { tier: string }) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.COMMON;
  return <span className={`clip-tag-sm border px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide ${style}`}>{tier}</span>;
}
