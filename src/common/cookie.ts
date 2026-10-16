import type { CookieOptions } from 'express';

// The login cookie is HTTP-only, so JavaScript can never read the token.
//
// Two environments need different SameSite/Secure settings:
//   local dev      frontend and API are both on localhost (same site):
//                  SameSite=Lax, no Secure (plain http works).
//   production     the frontend (vercel.app) and the API (another domain)
//                  are DIFFERENT sites, so the browser only sends the cookie
//                  on fetch() calls if it is SameSite=None, and browsers only
//                  accept SameSite=None together with Secure (https only).
//
// Production is detected from NODE_ENV=production. COOKIE_CROSS_SITE=true or
// false overrides it (e.g. to test the production cookie locally, or to run
// production mode on plain http behind a test setup).
function crossSite(): boolean {
  const override = process.env.COOKIE_CROSS_SITE;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export const AUTH_COOKIE_NAME = 'token';
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Options for res.cookie(...) when logging in. */
export function authCookieOptions(): CookieOptions {
  const cross = crossSite();
  return {
    httpOnly: true,
    sameSite: cross ? 'none' : 'lax',
    secure: cross,
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

/**
 * Options for res.clearCookie(...). Must match the attributes the cookie was
 * set with (httpOnly / sameSite / secure) or the browser keeps the cookie.
 * maxAge is left out on purpose (clearCookie sets its own expiry).
 */
export function clearAuthCookieOptions(): CookieOptions {
  const { httpOnly, sameSite, secure } = authCookieOptions();
  return { httpOnly, sameSite, secure };
}
