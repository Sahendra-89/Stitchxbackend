import express from 'express';
import path from 'node:path';
import publicRoutes from './routes/publicRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import docRoutes from './routes/docRoutes.js';
import { uploadsDir } from './db.js';
import {
  securityHeadersMiddleware,
  corsMiddleware,
  mongoSanitizeMiddleware,
  apiGeneralRateLimiter,
  verifyCsrfToken,
} from './security/index.js';

const apiApp = express();

// 1. Remove technology fingerprinting
apiApp.disable('x-powered-by');

// 2. HTTP Security Headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options)
apiApp.use(securityHeadersMiddleware);

// 3. Strict Environment-driven CORS configuration
apiApp.use(corsMiddleware);

// 4. Global API rate limiting
apiApp.use('/api', apiGeneralRateLimiter);

// 5. Body parsing with safe size limits (prevents payload exhaustion / memory DOS)
apiApp.use(express.json({ limit: '10mb' }));
apiApp.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. NoSQL Injection sanitization (recursively strips $ operators and dots)
apiApp.use(mongoSanitizeMiddleware);

// 7. CSRF defense for state-changing requests
apiApp.use('/api', verifyCsrfToken);

// 8. Static uploads directory with defensive headers (disallow HTML/SVG execution, force nosniff)
apiApp.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    next();
  },
  express.static(uploadsDir)
);

// 9. Mount StitchX document management API routes
apiApp.use('/api/docs', docRoutes);

// 10. Mount admin API routes
apiApp.use('/api/admin', adminRoutes);

// 11. Mount public API routes
apiApp.use('/api', publicRoutes);

// 12. Safe fallback error handler (prevents stack traces & internal error leakage in production)
apiApp.use('/api', (err, req, res, next) => {
  console.error('[API Error]', err);
  if (res.headersSent) return next(err);

  const isProd = process.env.NODE_ENV === 'production';
  const statusCode = err.status || err.statusCode || 500;
  const errorMessage = (statusCode === 500 && isProd)
    ? 'An unexpected internal error occurred. Please contact system support.'
    : (err.message || 'Internal Server Error');

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
  });
});

export { apiApp };
export default apiApp;
