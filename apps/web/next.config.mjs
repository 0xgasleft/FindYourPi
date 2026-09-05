/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi's optional MetaMask SDK / WalletConnect connectors pull in
    // Node-only optional deps (encoding, pino-pretty) that are never
    // actually reached in the browser bundle — silence the harmless
    // "module not found" warnings rather than installing dead weight.
    config.resolve.fallback = { ...config.resolve.fallback, encoding: false, "pino-pretty": false };
    return config;
  },
};

export default nextConfig;
