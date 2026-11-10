import type { NextConfig } from "next"

const backendURL = process.env.BACKEND_URL ?? "http://localhost:8080"
// Comma-separated hosts allowed to load dev assets/HMR (e.g. a Tailscale IP), set by scripts/dev-web.sh.
const devOrigins = (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean)

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  experimental: {
    agentFeedback: true,
    // The rewrite proxy gives up after 30 s by default. AI replies (design evaluation, code review) can take longer, and the
    // Go side stops waiting on the model at 100 s.
    proxyTimeout: 120_000,
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
