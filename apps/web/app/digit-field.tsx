import { DECORATIVE_PI_DIGITS } from "./pi-digits";

const COLUMN_COUNT = 14;

// Purely decorative, aria-hidden background of drifting π digits.
// Each column offsets the same digit string so columns don't scroll in lockstep.
export function DigitField() {
  const repeated = DECORATIVE_PI_DIGITS.repeat(6);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-digit-field motion-reduce:hidden"
    >
      <div className="absolute inset-0 flex justify-between opacity-[0.14]">
        {Array.from({ length: COLUMN_COUNT }).map((_, col) => {
          const offset = (col * 17) % repeated.length;
          const digits = (repeated.slice(offset) + repeated.slice(0, offset)).split("");
          return (
            <div
              key={col}
              className="flex animate-digit-drift flex-col items-center gap-6 font-mono text-lg text-pi-gold"
              style={{ animationDelay: `${(col % 5) * -7}s`, animationDuration: `${50 + (col % 5) * 8}s` }}
            >
              {[...digits, ...digits].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-void-950 via-transparent to-void-950" />
    </div>
  );
}
