import type { NextConfig } from "next"

const backendURL = process.env.BACKEND_URL ?? "http://localhost:8080"

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  devIndicators: { position: "bottom-right" },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Same-origin API: the browser never talks to the Go backend directly, so session cookies stay first-party.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendURL}/api/:path*` }]
  },
}

export default nextConfig
