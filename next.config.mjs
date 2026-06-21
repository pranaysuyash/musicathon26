/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingExcludes: {
      "*": [
        "data/cache/hf/**",
        "data/logs/**",
        "data/exports/screenshots/**",
        "data/versesignal.db-wal",
      ],
    },
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
