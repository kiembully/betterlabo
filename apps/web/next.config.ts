import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * The public portal is static-first: every page renders from the cached JSON in
 * `public/data`, so there is no remote image host and no runtime API dependency
 * for public content.
 *
 * `npm run lint` is the lint gate — Next 16 no longer accepts an `eslint` key in
 * NextConfig, and failing `next build` on lint only slows the data refresh loop.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * The Express API workspace is imported directly by the `/api/*` bridge route,
   * so it is transpiled from source while its driver dependencies stay external
   * (mongoose's dynamic requires do not bundle).
   */
  transpilePackages: ['@betterlabo/api', '@betterlabo/shared'],
  serverExternalPackages: ['mongoose', 'mongodb', 'bcryptjs', 'jsonwebtoken'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), payment=()',
          },
        ],
      },
      {
        // The compiled data is content-addressed by `dataHash`, so it can be
        // cached hard, but a refresh must be visible within the hour.
        source: '/data/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: isDev
              ? 'no-store'
              : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
