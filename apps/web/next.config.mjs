import path from 'node:path';

/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * Baseline security headers for every page (Next.js production checklist: security).
 * A full Content-Security-Policy needs per-request nonces for Next's inline scripts; it is
 * listed as a known gap in CLAUDE.md rather than shipped half-working.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig = {
  reactStrictMode: true,
  // A production build can sit next to a running `next dev` (which owns .next) without breaking it.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // The Docker image builds a standalone server; local `next start` keeps the default output.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone', outputFileTracingRoot: path.join(import.meta.dirname, '../..') }
    : {}),
  poweredByHeader: false,
  experimental: {
    // Going back to a page seen in the last 30 s is instant (served from the client router cache).
    // Every mutation calls router.refresh(), which clears it, so a seller never sees their own stale data.
    staleTimes: { dynamic: 30 },
  },
  devIndicators: { position: 'bottom-right' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // The browser only talks to this origin: /api/* is proxied to the Nest API so
  // the session cookie stays first-party and there is no CORS (SRS 3.3).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/v1/:path*` }];
  },
};

export default nextConfig;
