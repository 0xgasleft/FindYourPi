import type { Config } from "tailwindcss";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const preset = require("@pi-hunter/config/tailwind.preset.js");

const config: Config = {
  presets: [preset],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
};

export default config;
