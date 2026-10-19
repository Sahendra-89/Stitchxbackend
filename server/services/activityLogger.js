import { ActivityLog } from '../models/index.js';

/**
 * Audit log helper that records security and business actions safely.
 * Strips sensitive data (passwords, tokens, bank secrets) before persisting.
 */
export async function logActivity({
  req,
  action,
  recordType = '',
  recordId = '',
  description,
  metadata = {},
}) {
  try {
    const actorId = req?.adminSession?.user_id || 'system';
    const username = req?.adminSession?.username || 'system';
    const ip = req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || '';

    // Sanitize metadata to avoid leaking sensitive fields
    const safeMetadata = { ...metadata };
    delete safeMetadata.password;
    delete safeMetadata.password_hash;
    delete safeMetadata.token;
    delete safeMetadata.authorization;
    delete safeMetadata.bank_account_number;
    delete safeMetadata.salt;

    await ActivityLog.create({
      actor_id: String(actorId),
      username: String(username),
      action,
      record_type: recordType,
      record_id: String(recordId),
      description,
      metadata: safeMetadata,
      ip_address: String(ip).slice(0, 45),
    });
  } catch (err) {
    // Fail-open for audit logging so business transactions are not halted if logging fails
    console.error('[Audit Logger Error]', err.message);
  }
}
