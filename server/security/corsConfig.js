/**
 * Strict Environment-Specific CORS Middleware
 * Implements granular origin allowlisting and safe preflight negotiation.
 */

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5000',
];

export function buildAllowedOrigins() {
  const origins = new Set(DEFAULT_ORIGINS);

  if (process.env.FRONTEND_URL) {
    origins.add(process.env.FRONTEND_URL.replace(/\/$/, ''));
  }
  if (process.env.ADMIN_PORTAL_URL) {
    origins.add(process.env.ADMIN_PORTAL_URL.replace(/\/$/, ''));
  }
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',')
      .map(s => s.trim().replace(/\/$/, ''))
      .filter(Boolean)
      .forEach(o => origins.add(o));
  }

  return origins;
}

export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const allowedOrigins = buildAllowedOrigins();

  // If no Origin header (same-origin request, mobile app, or server-to-server), allow
  if (!origin) {
    return next();
  }

  const normalizedOrigin = origin.replace(/\/$/, '');
  const isAllowed = allowedOrigins.has(normalizedOrigin) ||
    Boolean(process.env.ALLOW_VERCEL_PREVIEWS === 'true' && /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(normalizedOrigin));

  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Admin-Token, X-CSRF-Token, X-Requested-With'
    );
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  // Preflight OPTIONS handling
  if (req.method === 'OPTIONS') {
    if (isAllowed) {
      return res.status(204).end();
    }
    return res.status(403).json({ success: false, error: 'CORS policy violation: Origin not permitted.' });
  }

  if (!isAllowed) {
    return res.status(403).json({ success: false, error: 'CORS policy violation: Origin not permitted.' });
  }

  next();
}

export default corsMiddleware;
