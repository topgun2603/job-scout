import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / node-only modules must not be bundled.
  serverExternalPackages: ["playwright", "mupdf", "sharp", "firebase-admin"],
  // config/*.yaml is read at runtime with fs, so the tracer cannot see it; ship it with every route.
  outputFileTracingIncludes: { "/**": ["./config/**"] },
};

export default nextConfig;
