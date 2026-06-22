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
    outputFileTracingIncludes: {
      "*": ["data/versesignal.db", "scripts/schema.sql"],
    },
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
