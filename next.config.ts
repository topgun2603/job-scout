import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / node-only modules must not be bundled.
  serverExternalPackages: ["better-sqlite3", "playwright", "mupdf", "sharp"],
};

export default nextConfig;
