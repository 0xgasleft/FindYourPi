/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  theme: {
    // Sharp, precision-cut design language: zero radius everywhere by
    // default so an accidental `rounded-md`/`rounded-xl` can't reintroduce
    // soft corners. `full` is kept only for tiny status dots.
    borderRadius: {
      none: "0px",
      sm: "0px",
      DEFAULT: "0px",
      md: "0px",
      lg: "0px",
      xl: "0px",
      "2xl": "0px",
      "3xl": "0px",
      full: "9999px",
    },
    extend: {
      colors: {
        void: {
          950: "#030304",
          900: "#08080b",
          800: "#0f0f14",
          700: "#18181f",
          600: "#232330",
        },
        pi: {
          gold: "#f2c94c",
          amber: "#ffb84d",
        },
        arcade: {
          violet: "#8b5cf6",
          cyan: "#22d3ee",
          magenta: "#ec4899",
        },
        arc: {
          mint: "#69e0bc",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "digit-field":
          "radial-gradient(circle at 20% 20%, rgba(139,92,246,0.15), transparent 40%), radial-gradient(circle at 80% 0%, rgba(34,211,238,0.12), transparent 45%), radial-gradient(circle at 50% 100%, rgba(242,201,76,0.08), transparent 50%)",
        "grid-lines":
          "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "48px 48px",
      },
      boxShadow: {
        "glow-gold": "0 0 40px -8px rgba(242,201,76,0.35)",
        "glow-violet": "0 0 40px -8px rgba(139,92,246,0.35)",
      },
      keyframes: {
        "digit-drift": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-50%)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: 0.6 },
          "50%": { opacity: 1 },
        },
        "fade-up": {
          "0%": { opacity: 0, transform: "translateY(16px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-33.3333%)" },
        },
      },
      animation: {
        "digit-drift": "digit-drift 60s linear infinite",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        "fade-up": "fade-up 0.8s cubic-bezier(0.16,1,0.3,1) both",
        marquee: "marquee 24s linear infinite",
      },
    },
  },
};
