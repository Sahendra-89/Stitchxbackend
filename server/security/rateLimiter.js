/**
 * Enterprise In-Memory Sliding-Window Rate Limiter
 * Provides DDoS, brute-force, and spam mitigation without requiring external Redis in single-node/dev environments.
 */

class RateLimiterStore {
  constructor(windowMs, maxRequests) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.hits = new Map();

    // Auto cleanup expired records every 5 minutes
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of this.hits.entries()) {
        const valid = timestamps.filter(t => now - t < this.windowMs);
        if (valid.length === 0) {
          this.hits.delete(key);
        } else {
          this.hits.set(key, valid);
        }
      }
    }, 5 * 60 * 1000).unref?.();
  }

  recordHit(key) {
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];
    const valid = timestamps.filter(t => now - t < this.windowMs);

    if (valid.length >= this.maxRequests) {
      this.hits.set(key, valid);
      const oldest = valid[0];
      const resetInSeconds = Math.ceil((oldest + this.windowMs - now) / 1000);
      return {
        limited: true,
        remaining: 0,
        resetInSeconds: Math.max(1, resetInSeconds),
      };
    }

    valid.push(now);
    this.hits.set(key, valid);
    return {
      limited: false,
      remaining: this.maxRequests - valid.length,
      resetInSeconds: Math.ceil(this.windowMs / 1000),
    };
  }

  reset(key) {
    this.hits.delete(key);
  }
}

/**
 * Resolves client IP securely without blindly trusting spoofed X-Forwarded-For headers.
 */
export function getTrustedClientIp(req) {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';

  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
  }

  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

/**
 * Factory creating Express middleware for a given rate limit policy.
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  maxRequests = 100,
  message = 'Too many requests from this network. Please try again later.',
  keyGenerator = getTrustedClientIp,
} = {}) {
  const store = new RateLimiterStore(windowMs, maxRequests);

  const limiterMiddleware = (req, res, next) => {
    const key = keyGenerator(req);
    const { limited, remaining, resetInSeconds } = store.recordHit(key);

    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetInSeconds));

    if (limited) {
      res.setHeader('Retry-After', String(resetInSeconds));
      return res.status(429).json({
        success: false,
        error: message,
        retryAfterSeconds: resetInSeconds,
      });
    }

    next();
  };

  limiterMiddleware.resetKey = (key) => store.reset(key);
  return limiterMiddleware;
}

// 1. Strict Limiter for Admin Authentication (Prevents Brute-Force Attacks)
// 5 attempts per 15 minutes per IP
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many failed login attempts. For security reasons, please wait 15 minutes before trying again.',
});

// 2. Public Form Limiter (Prevents Email/Spam Abuse on Contact & Review Submissions)
// 10 submissions per 10 minutes per IP
export const publicFormRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 10,
  message: 'Submission limit reached for your network. Please wait a few minutes before submitting another request.',
});

// 3. General API Limiter (Mitigates Scraping & Rapid ReDoS payloads)
// 300 requests per 1 minute
export const apiGeneralRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  message: 'API request threshold exceeded. Please throttle your requests.',
});
