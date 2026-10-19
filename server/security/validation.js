import mongoose from 'mongoose';

/**
 * Escapes regex metacharacters to prevent ReDoS and regex injection attacks.
 */
export function escapeRegex(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Validates that an ID is a valid 24-character hexadecimal MongoDB ObjectId.
 */
export function isValidObjectId(id) {
  if (typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id.trim());
}

/**
 * Validates password strength:
 * - Minimum 10 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
export function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 10) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

/**
 * Password strength error message generator.
 */
export function getPasswordStrengthError() {
  return 'Password must be at least 10 characters long and include uppercase, lowercase, numbers, and special characters.';
}

/**
 * Normalizes and validates email addresses.
 */
export function sanitizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * RFC-compliant email validation.
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const sanitized = email.trim();
  if (sanitized.length === 0 || sanitized.length > 254) return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(sanitized);
}

/**
 * Sanitizes generic user-supplied strings by trimming and truncating.
 */
export function sanitizeString(val, maxLen = 255) {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  return maxLen > 0 ? str.slice(0, maxLen) : str;
}
