import type { MetadataRoute } from 'next';

/** The landing page is public; everything behind login stays out of search results. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/orders', '/products', '/customers', '/expenses', '/reports', '/settings', '/api'],
    },
  };
}
