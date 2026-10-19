import { Resend } from 'resend';
import dotenv from 'dotenv';
import { getTrustedClientIp } from './security/index.js';

// Ensure environment variables are loaded
dotenv.config();

// Rate limiting in-memory storage: IP -> Array of timestamps
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

// Clean up old rate limit entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const recent = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, recent);
    }
  }
}, 15 * 60 * 1000).unref?.();

/**
 * Checks if the given client IP has exceeded the rate limit.
 */
function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(ip, validTimestamps);
    return true;
  }

  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return false;
}

/**
 * Escapes characters that have special meaning in HTML to prevent HTML injection.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Validates email format according to standard RFC patterns.
 */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // RFC 5322 compatible pattern for robust email validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

/**
 * Parses request body for both Express and Node native incoming requests.
 */
export async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      // Protect against oversized payloads (max 50KB)
      if (raw.length > 50 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Sends JSON response across Express, Vite connect middleware, and Node native http.
 */
export function sendJsonResponse(res, statusCode, data) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(data);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * Main handler for processing contact form submissions.
 */
export async function handleContactSubmission(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return sendJsonResponse(res, 405, {
      success: false,
      error: 'Method Not Allowed. Only POST is supported.',
    });
  }

  // Determine client IP for rate limiting using trusted IP resolution
  const clientIp = getTrustedClientIp(req);

  if (isRateLimited(clientIp)) {
    return sendJsonResponse(res, 429, {
      success: false,
      error: 'Too many inquiries submitted from your network. Please wait a few minutes before trying again.',
    });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return sendJsonResponse(res, 400, {
      success: false,
      error: 'Malformed request payload.',
    });
  }

  const isJobApp = body.type === 'job_application' || Boolean(body.resumeUrl);

  // Anti-Spam: If honeypot is filled, return success silently without sending email
  if (body._gotcha && String(body._gotcha).trim().length > 0) {
    return sendJsonResponse(res, 200, {
      success: true,
      message: isJobApp
        ? 'Thank you for your application. Your information has been received successfully.'
        : 'Thank you for your project inquiry. Your information has been received successfully. Our team will contact you shortly.',
    });
  }

  // Load email configuration securely from server environment
  const companyEmail = process.env.COMPANY_EMAIL;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'StitchX Global Technology <onboarding@resend.dev>';

  if (!companyEmail) {
    console.error('[API /api/contact] Missing COMPANY_EMAIL in environment variables.');
    return sendJsonResponse(res, 500, {
      success: false,
      error: 'Unable to send your inquiry right now. Please try again or contact us directly.',
    });
  }

  const web3FormsKey = process.env.WEB3FORMS_ACCESS_KEY || process.env.VITE_WEB3FORMS_ACCESS_KEY || (resendApiKey && !resendApiKey.startsWith('re_') ? resendApiKey : null);
  const hasValidResendKey = typeof resendApiKey === 'string' && resendApiKey.startsWith('re_');

  // Branch 1: Job Application Submission
  if (isJobApp) {
    const {
      fullName,
      email,
      phone,
      resumeUrl,
      portfolioUrl,
      appliedPosition,
      department,
    } = body;

    const cleanFullName = typeof fullName === 'string' ? fullName.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
    const cleanResumeUrl = typeof resumeUrl === 'string' ? resumeUrl.trim() : '';
    const cleanPortfolioUrl = typeof portfolioUrl === 'string' ? portfolioUrl.trim() : '';
    const cleanPosition = typeof appliedPosition === 'string' ? appliedPosition.trim() : 'Software Engineer';
    const cleanDepartment = typeof department === 'string' ? department.trim() : 'Engineering';

    const validationErrors = [];
    if (!cleanFullName) {
      validationErrors.push('Full Name is required.');
    } else if (cleanFullName.length > 120) {
      validationErrors.push('Full Name is too long (maximum 120 characters).');
    }

    if (!cleanEmail) {
      validationErrors.push('Email address is required.');
    } else if (!isValidEmail(cleanEmail)) {
      validationErrors.push('A valid Email address is required.');
    }

    if (!cleanPhone) {
      validationErrors.push('Phone number is required.');
    } else if (cleanPhone.length > 50) {
      validationErrors.push('Phone number is too long (maximum 50 characters).');
    }

    if (!cleanResumeUrl) {
      validationErrors.push('Resume URL is required.');
    } else {
      try {
        const parsed = new URL(cleanResumeUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          validationErrors.push('Resume URL must use http or https.');
        }
      } catch {
        validationErrors.push('Resume URL must be a valid web address (e.g. Google Drive, LinkedIn, or personal domain).');
      }
    }

    if (validationErrors.length > 0) {
      return sendJsonResponse(res, 400, {
        success: false,
        error: validationErrors[0],
        details: validationErrors,
      });
    }

    const emailSubject = `Job Application: ${cleanPosition} — ${cleanFullName}`;

    if (!hasValidResendKey && web3FormsKey) {
      try {
        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            access_key: web3FormsKey,
            subject: emailSubject,
            from_name: `${cleanFullName} [StitchX Careers]`,
            name: cleanFullName,
            email: cleanEmail,
            replyto: cleanEmail,
            'Applied Position': cleanPosition,
            'Department': cleanDepartment,
            'Applicant Name': cleanFullName,
            'Applicant Email': cleanEmail,
            'Phone Number': cleanPhone,
            'Resume URL': cleanResumeUrl,
            'Portfolio / GitHub': cleanPortfolioUrl || 'Not provided',
          }),
        });

        const result = await response.json().catch(() => null);
        if (response.ok && result?.success) {
          return sendJsonResponse(res, 200, {
            success: true,
            message: 'Thank you for your application. Your information has been received successfully. Our hiring team will review your application shortly.',
          });
        }
      } catch (w3Err) {
        console.error('[API /api/contact:job_application] Web3Forms server dispatch error:', w3Err);
      }
    }

    if (!hasValidResendKey) {
      console.error('[API /api/contact:job_application] Missing valid RESEND_API_KEY in environment variables.');
      return sendJsonResponse(res, 500, {
        success: false,
        error: 'Unable to submit your application right now. Please try again or email us directly at rajankitt01@gmail.com.',
      });
    }

    const plainTextBody = `NEW JOB APPLICATION\n===================\nPosition: ${cleanPosition}\nDepartment: ${cleanDepartment}\nApplicant: ${cleanFullName}\nEmail: ${cleanEmail}\nPhone: ${cleanPhone}\nResume: ${cleanResumeUrl}\nPortfolio / GitHub: ${cleanPortfolioUrl || 'Not provided'}\n===================\nSubmitted through the StitchX Global Technology website.`;

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(emailSubject)}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F4F8; color: #0B1220; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E7EF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(17,24,39,0.04);">
    <div style="background-color: #0B1220; padding: 24px 28px; border-bottom: 3px solid #1677FF;">
      <span style="font-family: monospace; font-size: 11px; letter-spacing: 0.1em; color: #93C5FD; text-transform: uppercase;">// STITCHX GLOBAL TECHNOLOGY CAREERS NOTIFICATION</span>
      <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.02em;">NEW JOB APPLICATION</h1>
    </div>
    <div style="padding: 28px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 6px 0; color: #7A8494; width: 140px;">Position:</td>
          <td style="padding: 6px 0; font-weight: 700; color: #0B1220;">${escapeHtml(cleanPosition)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7A8494;">Department:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #0B1220;">${escapeHtml(cleanDepartment)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7A8494;">Applicant:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #0B1220;">${escapeHtml(cleanFullName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7A8494;">Email:</td>
          <td style="padding: 6px 0; font-weight: 600;">
            <a href="mailto:${escapeHtml(cleanEmail)}" style="color: #1677FF; text-decoration: none;">${escapeHtml(cleanEmail)}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7A8494;">Phone:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #0B1220;">${escapeHtml(cleanPhone)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7A8494;">Resume URL:</td>
          <td style="padding: 6px 0; font-weight: 600;">
            <a href="${escapeHtml(cleanResumeUrl)}" target="_blank" rel="noopener noreferrer" style="color: #1677FF; text-decoration: underline;">View Candidate Resume</a>
          </td>
        </tr>
        ${cleanPortfolioUrl ? `
        <tr>
          <td style="padding: 6px 0; color: #7A8494;">Portfolio / GitHub:</td>
          <td style="padding: 6px 0; font-weight: 600;">
            <a href="${escapeHtml(cleanPortfolioUrl)}" target="_blank" rel="noopener noreferrer" style="color: #1677FF; text-decoration: underline;">${escapeHtml(cleanPortfolioUrl)}</a>
          </td>
        </tr>` : ''}
      </table>
    </div>
  </div>
</body>
</html>`;

    const resend = new Resend(resendApiKey);
    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: [companyEmail],
        replyTo: cleanEmail,
        subject: emailSubject,
        text: plainTextBody,
        html: htmlBody,
      });

      if (error || !data?.id) {
        console.error('[API /api/contact:job_application] Resend API error:', error);
        return sendJsonResponse(res, 502, {
          success: false,
          error: 'Unable to submit your application right now. Please try again or contact us directly.',
        });
      }

      // Auto-reply to candidate
      try {
        await resend.emails.send({
          from: fromEmail,
          to: [cleanEmail],
          subject: `We Received Your Application for ${cleanPosition} — StitchX Global Technology`,
          text: `Hi ${cleanFullName},\n\nThank you for applying to StitchX Global Technology for the ${cleanPosition} role. We have successfully received your application. Our engineering hiring team will review your profile and reach out if there is a match.\n\nBest regards,\nStitchX Global Technology Engineering Team`,
          html: `<div style="padding: 24px; font-family: sans-serif; background-color: #F1F4F8;"><div style="max-width: 540px; margin: 0 auto; background: #fff; padding: 28px; border: 1px solid #E2E7EF; border-radius: 10px;"><h2 style="color: #0B1220;">Hi ${escapeHtml(cleanFullName)},</h2><p style="color: #2B384E;">Thank you for applying for the <strong>${escapeHtml(cleanPosition)}</strong> position at StitchX Global Technology.</p><p style="color: #2B384E;">We have received your application and resume. Our hiring team will review your materials and contact you if your profile aligns with our requirements.</p><p style="color: #0B1220; margin-top: 24px;">Regards,<br /><strong>StitchX Global Technology Team</strong></p></div></div>`,
        });
      } catch (autoReplyErr) {
        console.warn('[API /api/contact:job_application] Auto-reply note:', autoReplyErr?.message || autoReplyErr);
      }

      return sendJsonResponse(res, 200, {
        success: true,
        message: 'Thank you for your application. Your information has been received successfully. Our hiring team will review your application shortly.',
        id: data.id,
      });
    } catch (err) {
      console.error('[API /api/contact:job_application] Unexpected error:', err);
      return sendJsonResponse(res, 500, {
        success: false,
        error: 'Unable to submit your application right now. Please try again or email us directly at rajankitt01@gmail.com.',
      });
    }
  }

  // Branch 2: General Project Inquiry
  const {
    firstName,
    lastName,
    businessEmail,
    phoneNumber,
    service,
    budget,
    projectDetails,
  } = body;

  // Server-side validation
  const validationErrors = [];

  const cleanFirstName = typeof firstName === 'string' ? firstName.trim() : '';
  const cleanLastName = typeof lastName === 'string' ? lastName.trim() : '';
  const cleanEmail = typeof businessEmail === 'string' ? businessEmail.trim() : '';
  const cleanPhone = typeof phoneNumber === 'string' ? phoneNumber.trim() : '';
  const cleanService = typeof service === 'string' ? service.trim() : '';
  const cleanBudget = typeof budget === 'string' ? budget.trim() : '';
  const cleanDetails = typeof projectDetails === 'string' ? projectDetails.trim() : '';

  if (!cleanFirstName) {
    validationErrors.push('First Name is required.');
  } else if (cleanFirstName.length > 100) {
    validationErrors.push('First Name is too long (maximum 100 characters).');
  }

  if (!cleanLastName) {
    validationErrors.push('Last Name is required.');
  } else if (cleanLastName.length > 100) {
    validationErrors.push('Last Name is too long (maximum 100 characters).');
  }

  if (!cleanEmail) {
    validationErrors.push('Business Email is required.');
  } else if (!isValidEmail(cleanEmail)) {
    validationErrors.push('A valid Business Email address is required.');
  }

  if (cleanPhone && cleanPhone.length > 50) {
    validationErrors.push('Phone number is too long (maximum 50 characters).');
  }

  if (!cleanService) {
    validationErrors.push('Primary Service Required is required.');
  } else if (cleanService.length > 150) {
    validationErrors.push('Selected service is invalid.');
  }

  if (cleanBudget && cleanBudget.length > 100) {
    validationErrors.push('Project Budget is too long (maximum 100 characters).');
  }

  if (!cleanDetails) {
    validationErrors.push('Project Details & Technical Goals are required.');
  } else if (cleanDetails.length < 10) {
    validationErrors.push('Project Details must be at least 10 characters.');
  } else if (cleanDetails.length > 5000) {
    validationErrors.push('Project Details must not exceed 5000 characters.');
  }

  if (validationErrors.length > 0) {
    return sendJsonResponse(res, 400, {
      success: false,
      error: validationErrors[0],
      details: validationErrors,
    });
  }

  // Construct email contents
  const emailSubject = `New Project Inquiry — ${cleanFirstName} ${cleanLastName}`;

  // If Resend is not configured with a valid 're_' key, attempt delivery via Web3Forms
  if (!hasValidResendKey && web3FormsKey) {
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          access_key: web3FormsKey,
          subject: emailSubject,
          from_name: `${cleanFirstName} ${cleanLastName} [StitchX Global Technology]`,
          name: `${cleanFirstName} ${cleanLastName}`,
          email: cleanEmail,
          replyto: cleanEmail,
          'First Name': cleanFirstName,
          'Last Name': cleanLastName,
          'Business Email': cleanEmail,
          'Phone Number': cleanPhone || 'Not provided',
          'Primary Service Required': cleanService,
          'Project Budget': cleanBudget || 'Not specified',
          'Project Details & Technical Goals': cleanDetails,
        }),
      });

      const result = await response.json().catch(() => null);
      if (response.ok && result?.success) {
        return sendJsonResponse(res, 200, {
          success: true,
          message: 'Thank you for your project inquiry. Your information has been received successfully. Our team will contact you shortly.',
        });
      }
    } catch (w3Err) {
      console.error('[API /api/contact] Web3Forms server dispatch error:', w3Err);
    }
  }

  if (!hasValidResendKey) {
    console.error('[API /api/contact] Missing valid RESEND_API_KEY (starts with re_) in environment variables.');
    return sendJsonResponse(res, 500, {
      success: false,
      error: 'Unable to send your inquiry right now. Please try again or contact us directly.',
    });
  }

  const plainTextBody = `NEW PROJECT INQUIRY
===================

CLIENT INFORMATION

First Name:
${cleanFirstName}

Last Name:
${cleanLastName}

Business Email:
${cleanEmail}

Phone Number:
${cleanPhone || 'Not provided'}

PROJECT INFORMATION

Primary Service Required:
${cleanService}

Project Budget:
${cleanBudget || 'Not specified'}

PROJECT DETAILS & TECHNICAL GOALS

${cleanDetails}

===================
Submitted through the StitchX Global Technology website.`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(emailSubject)}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F4F8; color: #0B1220; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E7EF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(17,24,39,0.04);">
    
    <!-- Header Banner -->
    <div style="background-color: #0B1220; padding: 24px 28px; border-bottom: 3px solid #1677FF;">
      <span style="font-family: monospace; font-size: 11px; letter-spacing: 0.1em; color: #93C5FD; text-transform: uppercase;">// STITCHX GLOBAL TECHNOLOGY SYSTEM NOTIFICATION</span>
      <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.02em;">NEW PROJECT INQUIRY</h1>
    </div>

    <div style="padding: 28px;">
      
      <!-- Section: Client Information -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 13px; font-family: monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1677FF; border-bottom: 1px solid #EEF3FF; padding-bottom: 6px;">
          CLIENT INFORMATION
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #7A8494; width: 140px; vertical-align: top;">First Name:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0B1220;">${escapeHtml(cleanFirstName)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #7A8494; vertical-align: top;">Last Name:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0B1220;">${escapeHtml(cleanLastName)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #7A8494; vertical-align: top;">Business Email:</td>
            <td style="padding: 6px 0; font-weight: 600;">
              <a href="mailto:${escapeHtml(cleanEmail)}" style="color: #1677FF; text-decoration: none;">${escapeHtml(cleanEmail)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #7A8494; vertical-align: top;">Phone Number:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0B1220;">${escapeHtml(cleanPhone || 'Not provided')}</td>
          </tr>
        </table>
      </div>

      <!-- Section: Project Information -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 13px; font-family: monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1677FF; border-bottom: 1px solid #EEF3FF; padding-bottom: 6px;">
          PROJECT INFORMATION
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #7A8494; width: 140px; vertical-align: top;">Primary Service:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0B1220;">${escapeHtml(cleanService)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #7A8494; vertical-align: top;">Project Budget:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #0B1220;">${escapeHtml(cleanBudget || 'Not specified')}</td>
          </tr>
        </table>
      </div>

      <!-- Section: Project Details & Technical Goals -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px 0; font-size: 13px; font-family: monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1677FF; border-bottom: 1px solid #EEF3FF; padding-bottom: 6px;">
          PROJECT DETAILS &amp; TECHNICAL GOALS
        </h2>
        <div style="background-color: #F7F8FA; border: 1px solid #E2E7EF; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; color: #2B384E; white-space: pre-wrap;">${escapeHtml(cleanDetails)}</div>
      </div>

      <!-- Footer Info -->
      <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #E2E7EF; font-size: 12px; color: #7A8494; font-family: monospace;">
        Submitted through the StitchX Global Technology website. Direct reply will route to <strong style="color: #0B1220;">${escapeHtml(cleanEmail)}</strong>.
      </div>
    </div>
  </div>
</body>
</html>`;

  const resend = new Resend(resendApiKey);

  try {
    // Primary delivery to COMPANY_EMAIL with Reply-To set to the visitor's email
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [companyEmail],
      replyTo: cleanEmail,
      subject: emailSubject,
      text: plainTextBody,
      html: htmlBody,
    });

    if (error) {
      console.error('[API /api/contact] Resend API error:', error);
      return sendJsonResponse(res, 502, {
        success: false,
        error: 'Unable to send your inquiry right now. Please try again or contact us directly.',
      });
    }

    if (!data || !data.id) {
      console.error('[API /api/contact] Resend did not return a confirmation ID.');
      return sendJsonResponse(res, 502, {
        success: false,
        error: 'Unable to send your inquiry right now. Please try again or contact us directly.',
      });
    }

    // Secondary: Auto-reply confirmation email to client (wrapped in try/catch so failure doesn't affect main inquiry)
    try {
      const autoReplySubject = 'We Received Your Project Inquiry — StitchX Global Technology';
      const autoReplyText = `Hi ${cleanFirstName},

Thank you for contacting StitchX Global Technology.

We have successfully received your project inquiry. Our team will review your requirements and get back to you shortly.

Regards,
StitchX Global Technology Team`;

      const autoReplyHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(autoReplySubject)}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F4F8; color: #0B1220; line-height: 1.6;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E7EF; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(17,24,39,0.04);">
    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0B1220;">Hi ${escapeHtml(cleanFirstName)},</h2>
    <p style="font-size: 14px; color: #2B384E; margin-bottom: 12px;">Thank you for contacting StitchX Global Technology.</p>
    <p style="font-size: 14px; color: #2B384E; margin-bottom: 24px;">We have successfully received your project inquiry. Our team will review your requirements and get back to you shortly.</p>
    <p style="font-size: 14px; color: #0B1220; margin-bottom: 0;">
      Regards,<br />
      <strong>StitchX Global Technology Team</strong>
    </p>
  </div>
</body>
</html>`;

      await resend.emails.send({
        from: fromEmail,
        to: [cleanEmail],
        subject: autoReplySubject,
        text: autoReplyText,
        html: autoReplyHtml,
      });
    } catch (autoReplyErr) {
      console.warn('[API /api/contact] Auto-reply confirmation note:', autoReplyErr?.message || autoReplyErr);
    }

    return sendJsonResponse(res, 200, {
      success: true,
      message: 'Thank you for your project inquiry. Your information has been received successfully. Our team will contact you shortly.',
      id: data.id,
    });
  } catch (err) {
    console.error('[API /api/contact] Unexpected error during email dispatch:', err);
    return sendJsonResponse(res, 500, {
      success: false,
      error: 'Unable to send your inquiry right now. Please try again or contact us directly.',
    });
  }
}
