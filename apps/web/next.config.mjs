/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Turbopack is the default build/dev engine as of Next.js 16. wagmi's
  // optional MetaMask SDK / WalletConnect connectors reference Node-only
  // optional deps (encoding, pino-pretty) that are never actually reached
  // in the browser bundle — alias them to an empty module rather than
  // installing dead weight. (Replaces the old webpack() config override,
  // which Next 16 refuses to run under Turbopack — see the "Turbopack by
  // default" section of the v16 upgrade guide.)
  turbopack: {
    resolveAlias: {
      encoding: { browser: "./empty-module.ts" },
      "pino-pretty": { browser: "./empty-module.ts" },
    },
  },
};

export default nextConfig;
