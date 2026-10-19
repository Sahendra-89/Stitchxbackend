import crypto from 'node:crypto';

/**
 * Double-Submit Cookie / Header CSRF Defense
 * Protects state-changing endpoints against Cross-Site Request Forgery.
 */

const CSRF_COOKIE_NAME = '__Host-sx-csrf-token';
const FALLBACK_COOKIE_NAME = 'sx_csrf_token';

/**
 * Generates a cryptographically strong 32-byte hexadecimal CSRF token.
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Express middleware to issue or refresh the CSRF token cookie.
 */
export function issueCsrfToken(req, res) {
  const token = generateCsrfToken();
  const isProd = process.env.NODE_ENV === 'production';
  const cookieName = isProd && req.secure ? CSRF_COOKIE_NAME : FALLBACK_COOKIE_NAME;

  res.cookie(cookieName, token, {
    httpOnly: false, // Must be readable by client JS to attach to request headers
    secure: isProd && req.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  return token;
}

/**
 * Middleware that verifies CSRF token on state-changing requests (POST, PUT, PATCH, DELETE).
 * Exempts Bearer token-authenticated API requests (since browsers never send Authorization headers automatically).
 */
export function verifyCsrfToken(req, res, next) {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (safeMethods.has(req.method)) {
    return next();
  }

  // If request is authenticated via an explicit Authorization Bearer or x-admin-token header,
  // it is intrinsically protected against CSRF because browsers do not attach custom auth headers automatically.
  const hasCustomAuthHeader = Boolean(
    req.headers['authorization']?.startsWith('Bearer ') || req.headers['x-admin-token']
  );
  if (hasCustomAuthHeader) {
    return next();
  }

  // Exempt public form submissions that are rate-limited and originate from public visitors
  // (e.g. contact form submission or public review submission)
  const isPublicFormEndpoint = (
    req.path === '/contact' ||
    req.path === '/api/contact' ||
    req.path === '/reviews' ||
    req.path === '/api/reviews' ||
    req.path === '/jobs/apply' ||
    req.path === '/api/jobs/apply' ||
    req.path === '/admin/login' ||
    req.path === '/api/admin/login'
  );
  if (isPublicFormEndpoint) {
    return next();
  }

  // Otherwise, verify CSRF token from header or body
  const isProd = process.env.NODE_ENV === 'production';
  const cookieName = isProd && req.secure ? CSRF_COOKIE_NAME : FALLBACK_COOKIE_NAME;

  let cookieHeader = req.headers.cookie || '';
  let parsedCookies = req.cookies || {};
  if (!req.cookies && cookieHeader) {
    parsedCookies = {};
    cookieHeader.split(';').forEach(p => {
      const [k, ...v] = p.trim().split('=');
      if (k) parsedCookies[k] = decodeURIComponent(v.join('='));
    });
  }

  const cookieToken = parsedCookies[cookieName] || parsedCookies[FALLBACK_COOKIE_NAME];
  const submittedToken = req.headers['x-csrf-token'] || req.body?._csrf;

  if (!cookieToken || !submittedToken) {
    return res.status(403).json({
      success: false,
      error: 'CSRF token missing. Please refresh the page and try again.',
      code: 'CSRF_TOKEN_MISSING',
    });
  }

  // Timing-safe comparison to prevent timing side-channel attacks
  try {
    const bufA = Buffer.from(cookieToken);
    const bufB = Buffer.from(submittedToken);
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return res.status(403).json({
        success: false,
        error: 'Invalid CSRF token.',
        code: 'CSRF_TOKEN_INVALID',
      });
    }
  } catch {
    return res.status(403).json({
      success: false,
      error: 'Invalid CSRF token format.',
      code: 'CSRF_TOKEN_INVALID',
    });
  }

  next();
}

export default {
  generateCsrfToken,
  issueCsrfToken,
  verifyCsrfToken,
};
