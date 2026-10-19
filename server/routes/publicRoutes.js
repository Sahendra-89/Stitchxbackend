import express from 'express';
import {
  Review,
  BlogPost,
  Job,
  JobApplication,
  ContactEnquiry,
  ContactSettings,
  DocClient,
} from '../db.js';
import { generateDocumentNumber } from '../services/docNumberService.js';
import { resumeUpload } from '../uploadHandler.js';
import { Resend } from 'resend';
import dotenv from 'dotenv';
import {
  publicFormRateLimiter,
  escapeRegex,
  isValidEmail,
  sanitizeEmail,
  issueCsrfToken,
  getTrustedClientIp,
} from '../security/index.js';

dotenv.config();

const router = express.Router();

/**
 * GET /api/csrf-token
 * Issues a cryptographically strong double-submit CSRF cookie & token.
 */
router.get('/csrf-token', (req, res) => {
  const token = issueCsrfToken(req, res);
  return res.json({ success: true, csrfToken: token });
});

/* ==========================================================================
   1. REVIEWS (PUBLIC)
   ========================================================================== */

/**
 * GET /api/reviews
 * Returns ONLY approved and published reviews ordered by display_order ASC, created_at DESC.
 */
router.get('/reviews', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const reviews = await Review.find({ status: 'approved', is_published: true })
      .sort({ display_order: 1, created_at: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      reviews: reviews.map(r => ({ ...r, id: r._id.toString() })),
    });
  } catch (err) {
    console.error('Error fetching reviews:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve reviews.' });
  }
});

/**
 * POST /api/reviews
 * Public submission of client review. Automatically marked as 'pending' and unapproved.
 */
router.post('/reviews', publicFormRateLimiter, async (req, res) => {
  try {
    const { name, role, company, review, rating, avatar } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required.' });
    }
    if (!company || typeof company !== 'string' || !company.trim()) {
      return res.status(400).json({ success: false, error: 'Company name is required.' });
    }
    if (!review || typeof review !== 'string' || review.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Review text must be at least 10 characters.' });
    }

    const numericRating = parseInt(rating, 10);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be an integer between 1 and 5.' });
    }

    // Default to pending status & unpublished so an admin must approve it before it appears publicly
    const newReview = await Review.create({
      name: name.trim().slice(0, 100),
      role: (role || 'Client').trim().slice(0, 100),
      company: company.trim().slice(0, 100),
      review: review.trim().slice(0, 2000),
      rating: numericRating,
      avatar: (avatar || '').trim().slice(0, 500),
      status: 'pending',
      is_published: false,
      display_order: 999,
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you for your feedback! Your review has been submitted for verification.',
      id: newReview._id.toString(),
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    return res.status(500).json({ success: false, error: 'Failed to submit review.' });
  }
});

/* ==========================================================================
   2. BLOG (PUBLIC)
   ========================================================================== */

/**
 * GET /api/blog
 * Returns ONLY published posts with search, category filtering, and pagination.
 */
router.get('/blog', async (req, res) => {
  try {
    const { search, category, page = 1, limit = 6 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10) || 6));
    const offset = (pageNum - 1) * limitNum;

    const query = { status: 'published', is_published: true };

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search && search.trim()) {
      const term = escapeRegex(search.trim());
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { excerpt: { $regex: term, $options: 'i' } },
        { content: { $regex: term, $options: 'i' } },
        { tags: { $regex: term, $options: 'i' } },
      ];
    }

    const totalCount = await BlogPost.countDocuments(query);
    const rawPosts = await BlogPost.find(query)
      .sort({ created_at: -1, _id: -1 })
      .skip(offset)
      .limit(limitNum)
      .lean();

    const distinctCategories = await BlogPost.distinct('category', { status: 'published', is_published: true });
    const categories = ['All', ...distinctCategories.sort()];

    return res.json({
      success: true,
      posts: rawPosts.map(p => ({ ...p, id: p._id.toString() })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      categories,
    });
  } catch (err) {
    console.error('Error fetching blog posts:', err);
    return res.status(500).json({ success: false, error: 'Failed to load blog posts.' });
  }
});

/**
 * GET /api/blog/:slug
 * Returns published post detail by slug and related articles.
 */
router.get('/blog/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const post = await BlogPost.findOne({ slug, status: 'published', is_published: true }).lean();

    if (!post) {
      return res.status(404).json({ success: false, error: 'Article not found or not published.' });
    }

    // Fetch related articles
    const relatedPosts = await BlogPost.find({
      status: 'published',
      is_published: true,
      slug: { $ne: slug },
    })
      .sort({ created_at: -1 })
      .limit(3)
      .lean();

    return res.json({
      success: true,
      post: { ...post, id: post._id.toString() },
      relatedPosts: relatedPosts.map(p => ({ ...p, id: p._id.toString() })),
    });
  } catch (err) {
    console.error('Error fetching blog post details:', err);
    return res.status(500).json({ success: false, error: 'Failed to load article.' });
  }
});

/* ==========================================================================
   3. CAREERS (PUBLIC)
   ========================================================================== */

/**
 * GET /api/jobs
 * Returns active and published jobs with optional department/type filters.
 */
router.get('/jobs', async (req, res) => {
  try {
    const { department, type } = req.query;
    const query = { status: 'active', is_published: true };

    if (department && department !== 'All') {
      query.department = department;
    }
    if (type && type !== 'All') {
      query.job_type = type;
    }

    const rows = await Job.find(query).sort({ created_at: -1 }).lean();

    const jobs = rows.map(j => ({
      ...j,
      jobType: j.job_type,
      shortDescription: j.short_description,
      salaryRange: j.salary_range,
      applicationDeadline: j.application_deadline,
      niceToHave: j.nice_to_have || [],
    }));

    const deptRows = await Job.distinct('department', { status: 'active', is_published: true });
    const typeRows = await Job.distinct('job_type', { status: 'active', is_published: true });

    return res.json({
      success: true,
      jobs,
      departments: ['All', ...deptRows.sort()],
      jobTypes: ['All', ...typeRows.sort()],
    });
  } catch (err) {
    console.error('Error fetching jobs:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve job vacancies.' });
  }
});

/**
 * GET /api/jobs/:id
 * Returns active and published job detail.
 */
router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await Job.findOne({ id, status: 'active', is_published: true }).lean();

    if (!row) {
      return res.status(404).json({ success: false, error: 'Job position not found or no longer active.' });
    }

    const job = {
      ...row,
      jobType: row.job_type,
      shortDescription: row.short_description,
      salaryRange: row.salary_range,
      applicationDeadline: row.application_deadline,
      niceToHave: row.nice_to_have || [],
    };

    return res.json({ success: true, job });
  } catch (err) {
    console.error('Error fetching job details:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve job details.' });
  }
});

/**
 * POST /api/jobs/apply
 * Handles job application submission with secure resume file upload or resume URL.
 */
router.post('/jobs/apply', publicFormRateLimiter, (req, res) => {
  resumeUpload.single('resumeFile')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    try {
      const {
        jobId,
        fullName,
        email,
        phone,
        experience,
        resumeUrl,
        portfolioUrl,
      } = req.body || {};

      if (!fullName || !fullName.trim()) {
        return res.status(400).json({ success: false, error: 'Full name is required.' });
      }
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'A valid email address is required.' });
      }
      if (!phone || !phone.trim()) {
        return res.status(400).json({ success: false, error: 'Phone number is required.' });
      }

      // Check job validity
      let jobTitle = 'Software Engineering';
      if (jobId) {
        const foundJob = await Job.findOne({ id: jobId }).lean();
        if (foundJob) jobTitle = foundJob.title;
      }

      // Resume: either uploaded file or URL
      let resumeFileName = '';
      let finalResumeUrl = '';

      if (req.file) {
        resumeFileName = req.file.filename;
        finalResumeUrl = `[Uploaded File: ${req.file.originalname}]`;
      } else if (resumeUrl && resumeUrl.trim()) {
        finalResumeUrl = resumeUrl.trim();
        try {
          const parsed = new URL(finalResumeUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return res.status(400).json({ success: false, error: 'Resume URL must use HTTP or HTTPS protocol.' });
          }
        } catch {
          return res.status(400).json({ success: false, error: 'Please provide a valid resume URL starting with http:// or https://' });
        }
      } else {
        return res.status(400).json({ success: false, error: 'Please upload a resume file (PDF/DOC) or provide a resume link.' });
      }

      let cleanPortfolioUrl = '';
      if (portfolioUrl && portfolioUrl.trim()) {
        cleanPortfolioUrl = portfolioUrl.trim();
        try {
          const parsedP = new URL(cleanPortfolioUrl);
          if (parsedP.protocol !== 'http:' && parsedP.protocol !== 'https:') {
            return res.status(400).json({ success: false, error: 'Portfolio URL must use HTTP or HTTPS protocol.' });
          }
        } catch {
          return res.status(400).json({ success: false, error: 'Please provide a valid portfolio URL starting with http:// or https://' });
        }
      }

      const createdApp = await JobApplication.create({
        job_id: jobId || 'general',
        job_title: jobTitle,
        full_name: fullName.trim().slice(0, 120),
        email: sanitizeEmail(email).slice(0, 120),
        phone: phone.trim().slice(0, 50),
        experience: (experience || '').trim().slice(0, 50),
        resume_url: finalResumeUrl.slice(0, 500),
        resume_filename: resumeFileName,
        portfolio_url: cleanPortfolioUrl.slice(0, 500),
        status: 'New',
        internal_notes: '',
      });

      return res.status(201).json({
        success: true,
        message: 'Thank you for your application. Your resume and information have been received by our engineering talent team.',
        applicationId: createdApp._id.toString(),
      });
    } catch (dbErr) {
      console.error('Error saving job application:', dbErr);
      return res.status(500).json({ success: false, error: 'Unable to process job application. Please try again.' });
    }
  });
});

/* ==========================================================================
   4. CONTACT (PUBLIC)
   ========================================================================== */

/**
 * GET /api/contact/info
 * Returns dynamic public contact info (email, phone, address, business hours, social links).
 */
router.get('/contact/info', async (req, res) => {
  try {
    const settings = await ContactSettings.findOne().lean();
    if (!settings) {
      return res.json({
        success: true,
        contact: {
          email: 'sahendra2976@gmail.com',
          phone: '+91 93416 60370',
          address: 'Tower A, 3rd Floor, Unitech Cyber Park, Sector 39, Gurugram, Haryana, India',
          businessHours: 'Mon - Fri, 9:00 AM - 6:00 PM IST',
          socialLinks: {
            linkedin: 'https://linkedin.com/company/stitchx',
            twitter: 'https://twitter.com/stitchx',
            github: 'https://github.com/stitchx',
          },
        },
      });
    }

    return res.json({
      success: true,
      contact: {
        email: settings.email,
        phone: settings.phone,
        address: settings.address,
        businessHours: settings.business_hours,
        socialLinks: settings.social_links || {},
      },
    });
  } catch (err) {
    console.error('Error loading contact info:', err);
    return res.status(500).json({ success: false, error: 'Failed to load contact information.' });
  }
});

/**
 * POST /api/contact
 * Handles contact enquiries with spam honeypot, validation, db persistence, and email notification.
 */
router.post('/contact', publicFormRateLimiter, async (req, res) => {
  try {
    const ip = getTrustedClientIp(req);

    const body = req.body || {};

    // Anti-spam honeypot
    if (body._gotcha && String(body._gotcha).trim().length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Thank you for your project inquiry. Your information has been received successfully.',
      });
    }

    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const fullName = typeof body.name === 'string' ? body.name.trim() : `${firstName} ${lastName}`.trim();
    const email = typeof body.businessEmail === 'string' ? body.businessEmail.trim() : (body.email || '').trim();
    const phone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : (body.phone || '').trim();
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : (body.company || '').trim();
    const service = typeof body.service === 'string' ? body.service.trim() : 'Website & Web App Development';
    const budget = typeof body.budget === 'string' ? body.budget.trim() : '';
    const message = typeof body.projectDetails === 'string' ? body.projectDetails.trim() : (body.message || '').trim();

    // Server-side validation
    if (!fullName) {
      return res.status(400).json({ success: false, error: 'Name is required.' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }
    if (!service) {
      return res.status(400).json({ success: false, error: 'Primary service required.' });
    }
    if (!message || message.length < 10) {
      return res.status(400).json({ success: false, error: 'Please describe your project requirements (minimum 10 characters).' });
    }

    // Persistent storage in MongoDB
    const createdEnquiry = await ContactEnquiry.create({
      name: fullName.slice(0, 150),
      first_name: firstName.slice(0, 75),
      last_name: lastName.slice(0, 75),
      email: email.slice(0, 120),
      phone: phone.slice(0, 50),
      company_name: companyName.slice(0, 120),
      service: service.slice(0, 120),
      budget: budget.slice(0, 100),
      message: message.slice(0, 5000),
      status: 'New',
      private_notes: '',
      assigned_to: '',
      ip_address: ip,
    });

    // Also auto-sync lead into DocClient (so it appears in "Clients" module as well)
    try {
      const cleanEmail = email.toLowerCase().trim();
      const existingClient = await DocClient.findOne({ email: cleanEmail });
      if (!existingClient) {
        const client_id = await generateDocumentNumber('client');
        await DocClient.create({
          client_id,
          name: companyName || fullName,
          contact_person: fullName,
          email: cleanEmail,
          phone: phone || '',
          notes: `Lead from Website Contact Form\nService: ${service}\nBudget: ${budget || 'Not specified'}\nMessage: ${message}`,
          status: 'active',
          created_by: 'website_contact_form',
        });
      }
    } catch (clientSyncErr) {
      console.warn('[Contact -> DocClient Sync Note]', clientSyncErr.message);
    }

    // Optional email notification if Resend API key is provided
    const resendApiKey = process.env.RESEND_API_KEY;
    const companyEmail = process.env.COMPANY_EMAIL || 'rajankitt01@gmail.com';
    const fromEmail = process.env.FROM_EMAIL || 'StitchX Global Technology <onboarding@resend.dev>';

    if (resendApiKey && resendApiKey.startsWith('re_') && companyEmail) {
      try {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: fromEmail,
          to: companyEmail,
          replyTo: email,
          subject: `New StitchX Inquiry: ${service} — ${fullName}`,
          text: `New Lead from Website:\n\nName: ${fullName}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nCompany: ${companyName || 'N/A'}\nService: ${service}\nBudget: ${budget || 'N/A'}\n\nProject Scope:\n${message}`,
        });
      } catch (mailErr) {
        console.warn('[Contact Email] Notification dispatch skipped/failed:', mailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Thank you for your project inquiry. Your information has been received successfully. Our engineering team will contact you shortly.',
      enquiryId: createdEnquiry._id.toString(),
    });
  } catch (err) {
    console.error('Error handling contact submission:', err);
    return res.status(500).json({ success: false, error: 'Unable to process inquiry right now. Please try again or email us directly.' });
  }
});

export default router;
