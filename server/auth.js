import crypto from 'node:crypto';
import { AdminUser, AdminSession } from './db.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const AUTH_COOKIE_NAME = 'sx_admin_token';

/**
 * Attaches the secure HTTP-only authentication cookie to the response.
 */
export function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

/**
 * Clears the authentication cookie.
 */
export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    path: '/',
  });
}

/**
 * Verify admin credentials and issue a session token.
 * Includes account lockout protection and generic error responses.
 */
export async function authenticateAdmin(username, password, { ip = '', userAgent = '' } = {}) {
  const genericError = 'Invalid username or password.';

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return { success: false, error: 'Username and password are required.' };
  }

  const cleanUsername = username.trim();
  const user = await AdminUser.findOne({ username: cleanUsername }).select('+password_hash +salt');

  if (!user) {
    return { success: false, error: genericError };
  }

  // 1. Check if account is temporarily locked
  const now = new Date();
  if (user.locked_until && user.locked_until > now) {
    const remainingMinutes = Math.ceil((user.locked_until.getTime() - now.getTime()) / 60000);
    return {
      success: false,
      error: `Account is temporarily locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s).`,
      locked: true,
    };
  }

  // 2. Compute hash using user's salt
  const hashToTest = crypto.scryptSync(password, user.salt, 64).toString('hex');
  const bufferA = Buffer.from(user.password_hash, 'hex');
  const bufferB = Buffer.from(hashToTest, 'hex');

  // 3. Timing-safe comparison to prevent timing attacks
  const isValid = bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);

  if (!isValid) {
    // Increment failed attempts
    const attempts = (user.failed_login_attempts || 0) + 1;
    const update = { failed_login_attempts: attempts };

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      update.locked_until = new Date(now.getTime() + LOCKOUT_DURATION_MS);
      console.warn(`[Security Alert] Account "${cleanUsername}" locked after ${attempts} failed attempts.`);
    }

    await AdminUser.updateOne({ _id: user._id }, { $set: update });
    return { success: false, error: genericError };
  }

  // 4. Successful login: reset failed attempts & update metadata
  await AdminUser.updateOne(
    { _id: user._id },
    {
      $set: {
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: now,
        last_login_ip: ip,
      },
    }
  );

  // 5. Generate cryptographically strong session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await AdminSession.create({
    token,
    user_id: user._id.toString(),
    username: user.username,
    expires_at: expiresAt,
    created_ip: ip,
    user_agent: userAgent ? userAgent.slice(0, 255) : '',
  });

  return {
    success: true,
    token,
    user: {
      id: user._id.toString(),
      username: user.username,
      role: user.role || 'admin',
    },
  };
}

/**
 * Validates a session token.
 */
export async function validateSessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const session = await AdminSession.findOne({ token });
  if (!session) return null;

  const now = new Date();
  if (session.expires_at < now) {
    await AdminSession.deleteOne({ token });
    return null;
  }

  return session;
}

/**
 * Invalidate/revoke a session token upon logout.
 */
export async function invalidateSession(token) {
  if (!token || typeof token !== 'string') return;
  await AdminSession.deleteOne({ token });
}

/**
 * Express middleware to enforce admin authentication.
 * Checks Authorization header (Bearer), x-admin-token, or secure cookie.
 */
export async function requireAdminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  } else if (req.cookies?.[AUTH_COOKIE_NAME]) {
    token = req.cookies[AUTH_COOKIE_NAME];
  } else if (req.headers.cookie) {
    // Parse cookie header if cookie-parser is not active
    const cookies = {};
    req.headers.cookie.split(';').forEach(p => {
      const [k, ...v] = p.trim().split('=');
      if (k) cookies[k] = decodeURIComponent(v.join('='));
    });
    token = cookies[AUTH_COOKIE_NAME] || null;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication token is missing.',
    });
  }

  const session = await validateSessionToken(token);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Session is invalid or expired. Please sign in again.',
    });
  }

  req.adminSession = session;
  next();
}
