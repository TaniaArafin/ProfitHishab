import { NextResponse, type NextRequest } from 'next/server';

const APP_PREFIXES = ['/dashboard', '/orders', '/products', '/customers', '/expenses', '/reports', '/settings'];

/**
 * 1. Issues the CSRF double-submit cookie the API checks on every mutation.
 * 2. Sends visitors without a session cookie to /login. This is a convenience
 *    only; the API re-checks the session on every request (SRS 3.3).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isAppRoute = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const res =
    isAppRoute && !req.cookies.get('ph_session')
      ? NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, req.url))
      : NextResponse.next();

  if (!req.cookies.get('ph_csrf')) {
    res.cookies.set('ph_csrf', crypto.randomUUID(), { path: '/', sameSite: 'lax', httpOnly: false });
  }
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
