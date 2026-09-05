/** Viewfinder-style corner accents — reinforces the sharp/technical
 * identity on panels without adding a full border. Purely decorative. */
export function CornerBrackets({ color = "border-pi-gold/40", size = 14 }: { color?: string; size?: number }) {
  const base = `absolute ${color}`;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className={`${base} left-0 top-0 border-l border-t`} style={{ height: size, width: size }} />
      <span className={`${base} right-0 top-0 border-r border-t`} style={{ height: size, width: size }} />
      <span className={`${base} bottom-0 left-0 border-b border-l`} style={{ height: size, width: size }} />
      <span className={`${base} bottom-0 right-0 border-b border-r`} style={{ height: size, width: size }} />
    </div>
  );
}
