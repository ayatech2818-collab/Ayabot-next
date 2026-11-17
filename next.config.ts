import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // proxy.ts runs on /api/knowledge/* uploads, and Next.js buffers proxied request bodies only
    // up to this size (default 10 MB) - silently truncating anything larger. Knowledge files may
    // be up to 10 MiB plus multipart overhead; the route handlers reject anything bigger.
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
