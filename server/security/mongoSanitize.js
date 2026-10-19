/**
 * NoSQL Injection Protection Middleware
 * Recursively scans and sanitizes request payloads (body, query, params)
 * in-place to remove MongoDB query operators ($gt, $ne, $where, etc.) and dot notation
 * without reassigning read-only request properties.
 */

function sanitizeInPlace(obj) {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'object' && obj[i] !== null) {
        sanitizeInPlace(obj[i]);
      }
    }
    return;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    // Disarm or delete keys that start with '$' or contain '.'
    if (key.startsWith('$') || key.includes('.')) {
      try {
        delete obj[key];
      } catch {
        // If non-configurable, set to undefined
        obj[key] = undefined;
      }
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeInPlace(obj[key]);
    }
  }
}

/**
 * Express middleware to sanitize incoming request parameters against NoSQL injection.
 */
export function mongoSanitizeMiddleware(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      sanitizeInPlace(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      sanitizeInPlace(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      sanitizeInPlace(req.params);
    }
    next();
  } catch (err) {
    next(err);
  }
}

export default mongoSanitizeMiddleware;
