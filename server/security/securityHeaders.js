/**
 * Comprehensive HTTP Security Headers Middleware
 * Implements OWASP-recommended security headers without external third-party bloat.
 */

export function securityHeadersMiddleware(req, res, next) {
  // 1. Remove technology footprint
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // 2. Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 3. Prevent Clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // 4. Modern XSS filter disabling in favor of CSP
  res.setHeader('X-XSS-Protection', '0');

  // 5. Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 6. Cross-Origin policies
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // 7. Permissions Policy (Disables unused sensitive device sensors)
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=()'
  );

  // 8. Strict-Transport-Security (HSTS) in production or HTTPS
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // 9. Content-Security-Policy (CSP) tailored for React + Vite + Unsplash Assets
  // We allow necessary origins while restricting execution of untrusted scripts
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed by Vite dev HMR
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://images.unsplash.com https://*.unsplash.com",
    "media-src 'self' data: blob:",
    "connect-src 'self' ws: wss: https://api.resend.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  next();
}

export default securityHeadersMiddleware;
