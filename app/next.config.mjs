/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_MARKET_DATA_URL: process.env.NEXT_PUBLIC_MARKET_DATA_URL ||
      (process.env.VERCEL_ENV === "production" ? "https://srv1321446.hstgr.cloud/wick-api" : ""),
  },
  transpilePackages: ["@wick/shared", "@wick/pricing"],
  poweredByHeader: false,
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
