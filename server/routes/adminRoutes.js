import express from 'express';
import {
  Review,
  BlogPost,
  Job,
  JobApplication,
  ContactEnquiry,
  ContactSettings,
} from '../db.js';
import {
  authenticateAdmin,
  invalidateSession,
  requireAdminAuth,
  setAuthCookie,
  clearAuthCookie,
} from '../auth.js';
import { handleDownloadResume, imageUpload } from '../uploadHandler.js';
import {
  authRateLimiter,
  getTrustedClientIp,
  isValidObjectId,
  escapeRegex,
  sanitizeHtml,
} from '../security/index.js';

const router = express.Router();

/* ==========================================================================
   AUTHENTICATION ENDPOINTS (PUBLIC / UNAUTHENTICATED)
   ========================================================================== */

/**
 * POST /api/admin/login
 * Protected by authRateLimiter (brute-force defense) and account lockout.
 */
router.post('/login', authRateLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const ip = getTrustedClientIp(req);
  const userAgent = req.headers['user-agent'] || '';

  const result = await authenticateAdmin(username, password, { ip, userAgent });
  if (!result.success) {
    const statusCode = result.locked ? 423 : 401;
    return res.status(statusCode).json(result);
  }

  // Set secure HTTP-only cookie for browser-based session protection
  setAuthCookie(res, result.token);

  return res.json(result);
});

/* ==========================================================================
   AUTHENTICATED ADMIN ENDPOINTS (Protected by requireAdminAuth)
   ========================================================================== */

router.use(requireAdminAuth);

/**
 * POST /api/admin/logout
 */
router.post('/logout', async (req, res) => {
  const token = req.adminSession?.token;
  if (token) {
    await invalidateSession(token);
  }
  clearAuthCookie(res);
  return res.json({ success: true, message: 'Signed out successfully.' });
});

/**
 * GET /api/admin/me
 */
router.get('/me', (req, res) => {
  return res.json({
    success: true,
    user: {
      id: req.adminSession.user_id,
      username: req.adminSession.username,
    },
  });
});

/**
 * GET /api/admin/dashboard-stats
 */
router.get('/dashboard-stats', async (req, res) => {
  try {
    const [
      totalReviews,
      pendingReviews,
      approvedReviews,
      publishedReviews,
      totalPosts,
      publishedPosts,
      draftPosts,
      totalJobs,
      activeJobs,
      closedJobs,
      totalApplications,
      newApplications,
      reviewingApps,
      shortlistedApps,
      hiredApps,
      totalEnquiries,
      newEnquiries,
      inProgressEnquiries,
      convertedEnquiries,
      closedEnquiries,
    ] = await Promise.all([
      Review.countDocuments(),
      Review.countDocuments({ status: 'pending' }),
      Review.countDocuments({ status: 'approved' }),
      Review.countDocuments({ is_published: true }),
      BlogPost.countDocuments(),
      BlogPost.countDocuments({ status: 'published', is_published: true }),
      BlogPost.countDocuments({ $or: [{ status: 'draft' }, { is_published: false }] }),
      Job.countDocuments(),
      Job.countDocuments({ status: 'active', is_published: true }),
      Job.countDocuments({ $or: [{ status: 'closed' }, { is_published: false }] }),
      JobApplication.countDocuments(),
      JobApplication.countDocuments({ status: 'New' }),
      JobApplication.countDocuments({ status: 'Under Review' }),
      JobApplication.countDocuments({ status: 'Shortlisted' }),
      JobApplication.countDocuments({ status: 'Hired' }),
      ContactEnquiry.countDocuments(),
      ContactEnquiry.countDocuments({ status: 'New' }),
      ContactEnquiry.countDocuments({ status: { $in: ['In Progress', 'Contacted'] } }),
      ContactEnquiry.countDocuments({ status: 'Converted' }),
      ContactEnquiry.countDocuments({ status: 'Closed' }),
    ]);

    return res.json({
      success: true,
      stats: {
        reviews: {
          total: totalReviews,
          pending: pendingReviews,
          approved: approvedReviews,
          published: publishedReviews,
        },
        blog: {
          total: totalPosts,
          published: publishedPosts,
          drafts: draftPosts,
        },
        jobs: {
          total: totalJobs,
          active: activeJobs,
          closed: closedJobs,
        },
        applications: {
          total: totalApplications,
          new: newApplications,
          reviewing: reviewingApps,
          shortlisted: shortlistedApps,
          hired: hiredApps,
        },
        enquiries: {
          total: totalEnquiries,
          new: newEnquiries,
          inProgress: inProgressEnquiries,
          converted: convertedEnquiries,
          closed: closedEnquiries,
        },
      },
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    return res.status(500).json({ success: false, error: 'Failed to compute dashboard stats.' });
  }
});

/* ==========================================================================
   IMAGE UPLOAD ENDPOINT
   ========================================================================== */

router.post('/upload-image', imageUpload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image file provided.' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  return res.json({ success: true, url: fileUrl });
});

/* ==========================================================================
   1. REVIEWS MANAGEMENT
   ========================================================================== */

/**
 * GET /api/admin/reviews
 */
router.get('/reviews', async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }
    if (search && search.trim()) {
      const term = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { company: { $regex: term, $options: 'i' } },
        { review: { $regex: term, $options: 'i' } },
      ];
    }

    const reviews = await Review.find(query).sort({ display_order: 1, created_at: -1 }).lean();
    return res.json({
      success: true,
      reviews: reviews.map(r => ({ ...r, id: r._id.toString() })),
    });
  } catch (err) {
    console.error('Error fetching admin reviews:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch reviews.' });
  }
});

/**
 * POST /api/admin/reviews
 */
router.post('/reviews', async (req, res) => {
  try {
    const { name, role, company, review, rating, avatar, status = 'approved', is_published = 1, display_order = 0 } = req.body;

    if (!name || !company || !review) {
      return res.status(400).json({ success: false, error: 'Name, company, and review text are required.' });
    }

    const created = await Review.create({
      name: name.trim(),
      role: (role || 'Client').trim(),
      company: company.trim(),
      review: review.trim(),
      rating: parseInt(rating, 10) || 5,
      avatar: (avatar || '').trim(),
      status,
      is_published: Boolean(is_published),
      display_order: parseInt(display_order, 10) || 0,
    });

    const doc = created.toObject();
    return res.status(201).json({ success: true, review: { ...doc, id: doc._id.toString() } });
  } catch (err) {
    console.error('Error creating review:', err);
    return res.status(500).json({ success: false, error: 'Failed to create review.' });
  }
});

/**
 * PUT /api/admin/reviews/:id
 */
router.put('/reviews/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid review ID format.' });
    }

    const { name, role, company, review, rating, avatar, status, is_published, display_order } = req.body;

    const existing = await Review.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Review not found.' });
    }

    if (name !== undefined) existing.name = name.trim();
    if (role !== undefined) existing.role = role.trim();
    if (company !== undefined) existing.company = company.trim();
    if (review !== undefined) existing.review = review.trim();
    if (rating !== undefined) existing.rating = parseInt(rating, 10);
    if (avatar !== undefined) existing.avatar = avatar.trim();
    if (status !== undefined) existing.status = status;
    if (is_published !== undefined) existing.is_published = Boolean(is_published);
    if (display_order !== undefined) existing.display_order = parseInt(display_order, 10);

    await existing.save();
    const doc = existing.toObject();
    return res.json({ success: true, review: { ...doc, id: doc._id.toString() } });
  } catch (err) {
    console.error('Error updating review:', err);
    return res.status(500).json({ success: false, error: 'Failed to update review.' });
  }
});

/**
 * PATCH /api/admin/reviews/:id/status
 */
router.patch('/reviews/:id/status', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid review ID format.' });
    }

    const { status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be approved, rejected, or pending.' });
    }

    const updated = await Review.findByIdAndUpdate(id, { status }, { new: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Review not found.' });

    return res.json({ success: true, review: { ...updated, id: updated._id.toString() } });
  } catch (err) {
    console.error('Error updating review status:', err);
    return res.status(500).json({ success: false, error: 'Failed to update status.' });
  }
});

/**
 * PATCH /api/admin/reviews/:id/publish
 */
router.patch('/reviews/:id/publish', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid review ID format.' });
    }

    const { is_published } = req.body;

    const updated = await Review.findByIdAndUpdate(id, { is_published: Boolean(is_published) }, { new: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Review not found.' });

    return res.json({ success: true, review: { ...updated, id: updated._id.toString() } });
  } catch (err) {
    console.error('Error toggling review publish:', err);
    return res.status(500).json({ success: false, error: 'Failed to toggle publish status.' });
  }
});

/**
 * PUT /api/admin/reviews/reorder
 */
router.put('/reviews/reorder', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Items array is required.' });
    }

    await Promise.all(
      items.filter(item => isValidObjectId(item.id)).map(item =>
        Review.findByIdAndUpdate(item.id, { display_order: parseInt(item.display_order, 10) || 0 })
      )
    );

    return res.json({ success: true, message: 'Reviews reordered successfully.' });
  } catch (err) {
    console.error('Error reordering reviews:', err);
    return res.status(500).json({ success: false, error: 'Failed to reorder reviews.' });
  }
});

/**
 * DELETE /api/admin/reviews/:id
 */
router.delete('/reviews/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid review ID format.' });
    }
    await Review.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Review deleted successfully.' });
  } catch (err) {
    console.error('Error deleting review:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete review.' });
  }
});

/* ==========================================================================
   2. BLOG MANAGEMENT
   ========================================================================== */

/**
 * GET /api/admin/blog
 */
router.get('/blog', async (req, res) => {
  try {
    const { search, category, status } = req.query;
    const query = {};

    if (category && category !== 'All') {
      query.category = category;
    }
    if (status && status !== 'all') {
      query.status = status;
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

    const posts = await BlogPost.find(query).sort({ created_at: -1, _id: -1 }).lean();
    return res.json({
      success: true,
      posts: posts.map(p => ({ ...p, id: p._id.toString() })),
    });
  } catch (err) {
    console.error('Error fetching admin blog posts:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch posts.' });
  }
});

/**
 * POST /api/admin/blog
 */
router.post('/blog', async (req, res) => {
  try {
    const {
      title,
      slug,
      category,
      author,
      date,
      image,
      excerpt,
      content,
      tags = '',
      seo_title = '',
      seo_description = '',
      status = 'published',
      is_published = 1,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Post title is required.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Post content is required.' });
    }

    let cleanSlug = (slug || title)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const existing = await BlogPost.findOne({ slug: cleanSlug });
    if (existing) {
      cleanSlug = `${cleanSlug}-${Date.now().toString().slice(-4)}`;
    }

    const formattedDate = date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Defensive HTML sanitization of blog markup to prevent Stored XSS
    const sanitizedContent = sanitizeHtml(content.trim());

    const created = await BlogPost.create({
      cleanSlug,
      slug: cleanSlug,
      title: title.trim(),
      category: category || 'Engineering',
      author: author || 'StitchX Team',
      date: formattedDate,
      image: image || 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80',
      excerpt: excerpt ? excerpt.trim() : title.trim(),
      content: sanitizedContent,
      tags: tags || '',
      seo_title: seo_title || title.trim(),
      seo_description: seo_description || (excerpt || '').trim(),
      status,
      is_published: Boolean(is_published),
    });

    const doc = created.toObject();
    return res.status(201).json({ success: true, post: { ...doc, id: doc._id.toString() } });
  } catch (err) {
    console.error('Error creating blog post:', err);
    return res.status(500).json({ success: false, error: 'Failed to create blog post.' });
  }
});

/**
 * PUT /api/admin/blog/:id
 */
router.put('/blog/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid blog post ID format.' });
    }

    const existing = await BlogPost.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found.' });
    }

    const {
      title,
      slug,
      category,
      author,
      date,
      image,
      excerpt,
      content,
      tags,
      seo_title,
      seo_description,
      status,
      is_published,
    } = req.body;

    let targetSlug = existing.slug;
    if (slug && slug !== existing.slug) {
      targetSlug = slug
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const slugMatch = await BlogPost.findOne({ slug: targetSlug, _id: { $ne: id } });
      if (slugMatch) {
        targetSlug = `${targetSlug}-${Date.now().toString().slice(-4)}`;
      }
    }

    if (title !== undefined) existing.title = title.trim();
    existing.slug = targetSlug;
    if (category !== undefined) existing.category = category;
    if (author !== undefined) existing.author = author.trim();
    if (date !== undefined) existing.date = date;
    if (image !== undefined) existing.image = image.trim();
    if (excerpt !== undefined) existing.excerpt = excerpt.trim();
    if (content !== undefined) existing.content = sanitizeHtml(content.trim());
    if (tags !== undefined) existing.tags = tags;
    if (seo_title !== undefined) existing.seo_title = seo_title;
    if (seo_description !== undefined) existing.seo_description = seo_description;
    if (status !== undefined) existing.status = status;
    if (is_published !== undefined) existing.is_published = Boolean(is_published);

    await existing.save();
    const doc = existing.toObject();
    return res.json({ success: true, post: { ...doc, id: doc._id.toString() } });
  } catch (err) {
    console.error('Error updating blog post:', err);
    return res.status(500).json({ success: false, error: 'Failed to update blog post.' });
  }
});

/**
 * PATCH /api/admin/blog/:id/publish
 */
router.patch('/blog/:id/publish', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid blog post ID format.' });
    }

    const { is_published } = req.body;
    const newStatus = is_published ? 'published' : 'draft';

    const updated = await BlogPost.findByIdAndUpdate(
      id,
      { is_published: Boolean(is_published), status: newStatus },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ success: false, error: 'Post not found.' });

    return res.json({ success: true, post: { ...updated, id: updated._id.toString() } });
  } catch (err) {
    console.error('Error toggling blog post publish:', err);
    return res.status(500).json({ success: false, error: 'Failed to update publication status.' });
  }
});

/**
 * DELETE /api/admin/blog/:id
 */
router.delete('/blog/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid blog post ID format.' });
    }

    await BlogPost.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Blog post deleted successfully.' });
  } catch (err) {
    console.error('Error deleting blog post:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete blog post.' });
  }
});

/* ==========================================================================
   3. CAREERS & APPLICATIONS MANAGEMENT
   ========================================================================== */

/**
 * GET /api/admin/jobs
 */
router.get('/jobs', async (req, res) => {
  try {
    const rows = await Job.find().sort({ created_at: -1 }).lean();
    const jobsWithCounts = await Promise.all(
      rows.map(async (j) => {
        const count = await JobApplication.countDocuments({ job_id: j.id });
        return {
          ...j,
          jobType: j.job_type,
          shortDescription: j.short_description,
          salaryRange: j.salary_range,
          applicationDeadline: j.application_deadline,
          niceToHave: j.nice_to_have || [],
          applicationsCount: count,
        };
      })
    );
    return res.json({ success: true, jobs: jobsWithCounts });
  } catch (err) {
    console.error('Error fetching admin jobs:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch jobs.' });
  }
});

/**
 * POST /api/admin/jobs
 */
router.post('/jobs', async (req, res) => {
  try {
    const {
      id,
      title,
      department,
      location,
      jobType,
      experience,
      salaryRange,
      applicationDeadline,
      shortDescription,
      responsibilities = [],
      requirements = [],
      niceToHave = [],
      benefits = [],
      status = 'active',
      is_published = 1,
    } = req.body;

    if (!title || !department || !shortDescription) {
      return res.status(400).json({ success: false, error: 'Title, department, and description are required.' });
    }

    let slugId = (id || title)
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const collision = await Job.findOne({ id: slugId });
    if (collision) {
      slugId = `${slugId}-${Date.now().toString().slice(-4)}`;
    }

    const created = await Job.create({
      id: slugId,
      title: title.trim(),
      department: department.trim(),
      location: (location || 'Hybrid / India').trim(),
      job_type: jobType || 'Full-time',
      experience: (experience || '').trim(),
      salary_range: (salaryRange || '').trim(),
      application_deadline: (applicationDeadline || '').trim(),
      short_description: shortDescription.trim(),
      responsibilities: Array.isArray(responsibilities) ? responsibilities : [],
      requirements: Array.isArray(requirements) ? requirements : [],
      nice_to_have: Array.isArray(niceToHave) ? niceToHave : [],
      benefits: Array.isArray(benefits) ? benefits : [],
      status,
      is_published: Boolean(is_published),
    });

    const doc = created.toObject();
    return res.status(201).json({
      success: true,
      job: {
        ...doc,
        jobType: doc.job_type,
        shortDescription: doc.short_description,
        salaryRange: doc.salary_range,
        applicationDeadline: doc.application_deadline,
        niceToHave: doc.nice_to_have || [],
      },
    });
  } catch (err) {
    console.error('Error creating job:', err);
    return res.status(500).json({ success: false, error: 'Failed to create job opening.' });
  }
});

/**
 * PUT /api/admin/jobs/:id
 */
router.put('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Job.findOne({ id });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found.' });
    }

    const {
      title,
      department,
      location,
      jobType,
      experience,
      salaryRange,
      applicationDeadline,
      shortDescription,
      responsibilities,
      requirements,
      niceToHave,
      benefits,
      status,
      is_published,
    } = req.body;

    if (title !== undefined) existing.title = title.trim();
    if (department !== undefined) existing.department = department.trim();
    if (location !== undefined) existing.location = location.trim();
    if (jobType !== undefined) existing.job_type = jobType;
    if (experience !== undefined) existing.experience = experience;
    if (salaryRange !== undefined) existing.salary_range = salaryRange;
    if (applicationDeadline !== undefined) existing.application_deadline = applicationDeadline;
    if (shortDescription !== undefined) existing.short_description = shortDescription.trim();
    if (responsibilities !== undefined) existing.responsibilities = responsibilities;
    if (requirements !== undefined) existing.requirements = requirements;
    if (niceToHave !== undefined) existing.nice_to_have = niceToHave;
    if (benefits !== undefined) existing.benefits = benefits;
    if (status !== undefined) existing.status = status;
    if (is_published !== undefined) existing.is_published = Boolean(is_published);

    await existing.save();
    const doc = existing.toObject();
    return res.json({
      success: true,
      job: {
        ...doc,
        jobType: doc.job_type,
        shortDescription: doc.short_description,
        salaryRange: doc.salary_range,
        applicationDeadline: doc.application_deadline,
        niceToHave: doc.nice_to_have || [],
      },
    });
  } catch (err) {
    console.error('Error updating job:', err);
    return res.status(500).json({ success: false, error: 'Failed to update job opening.' });
  }
});

/**
 * PATCH /api/admin/jobs/:id/status
 */
router.patch('/jobs/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'closed', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status.' });
    }

    const updated = await Job.findOneAndUpdate({ id }, { status }, { new: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Job not found.' });

    return res.json({
      success: true,
      job: {
        ...updated,
        jobType: updated.job_type,
        shortDescription: updated.short_description,
        salaryRange: updated.salary_range,
        applicationDeadline: updated.application_deadline,
      },
    });
  } catch (err) {
    console.error('Error toggling job status:', err);
    return res.status(500).json({ success: false, error: 'Failed to update job status.' });
  }
});

/**
 * PATCH /api/admin/jobs/:id/publish
 */
router.patch('/jobs/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_published } = req.body;

    const updated = await Job.findOneAndUpdate({ id }, { is_published: Boolean(is_published) }, { new: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Job not found.' });

    return res.json({
      success: true,
      job: {
        ...updated,
        jobType: updated.job_type,
        shortDescription: updated.short_description,
        salaryRange: updated.salary_range,
        applicationDeadline: updated.application_deadline,
      },
    });
  } catch (err) {
    console.error('Error toggling job publish:', err);
    return res.status(500).json({ success: false, error: 'Failed to update job publish status.' });
  }
});

/**
 * DELETE /api/admin/jobs/:id
 */
router.delete('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Job.findOneAndDelete({ id });
    return res.json({ success: true, message: 'Job opening deleted successfully.' });
  } catch (err) {
    console.error('Error deleting job:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete job opening.' });
  }
});

/**
 * GET /api/admin/applications
 */
router.get('/applications', async (req, res) => {
  try {
    const { jobId, status, search } = req.query;
    const query = {};

    if (jobId && jobId !== 'all') {
      query.job_id = jobId;
    }
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search && search.trim()) {
      const term = escapeRegex(search.trim());
      query.$or = [
        { full_name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { job_title: { $regex: term, $options: 'i' } },
      ];
    }

    const apps = await JobApplication.find(query).sort({ created_at: -1, _id: -1 }).lean();
    return res.json({
      success: true,
      applications: apps.map(a => ({ ...a, id: a._id.toString() })),
    });
  } catch (err) {
    console.error('Error fetching applications:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve applications.' });
  }
});

/**
 * GET /api/admin/applications/:id
 */
router.get('/applications/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid application ID format.' });
    }
    const app = await JobApplication.findById(id).lean();
    if (!app) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }
    return res.json({ success: true, application: { ...app, id: app._id.toString() } });
  } catch (err) {
    console.error('Error fetching application details:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve application details.' });
  }
});

/**
 * GET /api/admin/applications/:id/resume
 */
router.get('/applications/:id/resume', (req, res) => {
  return handleDownloadResume(req, res);
});

/**
 * PATCH /api/admin/applications/:id
 */
router.patch('/applications/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid application ID format.' });
    }
    const { status, internal_notes } = req.body;

    const existing = await JobApplication.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Application not found.' });
    }

    const validStatuses = ['New', 'Under Review', 'Shortlisted', 'Rejected', 'Hired'];
    if (status && validStatuses.includes(status)) existing.status = status;
    if (internal_notes !== undefined) existing.internal_notes = internal_notes;

    await existing.save();
    const doc = existing.toObject();
    return res.json({ success: true, application: { ...doc, id: doc._id.toString() } });
  } catch (err) {
    console.error('Error updating application:', err);
    return res.status(500).json({ success: false, error: 'Failed to update application.' });
  }
});

/**
 * DELETE /api/admin/applications/:id
 */
router.delete('/applications/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid application ID format.' });
    }
    await JobApplication.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Application record deleted.' });
  } catch (err) {
    console.error('Error deleting application:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete application record.' });
  }
});

/* ==========================================================================
   4. CONTACT ENQUIRIES & SETTINGS MANAGEMENT
   ========================================================================== */

/**
 * GET /api/admin/enquiries
 */
router.get('/enquiries', async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }
    if (search && search.trim()) {
      const term = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { company_name: { $regex: term, $options: 'i' } },
        { message: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
      ];
    }

    const enquiries = await ContactEnquiry.find(query).sort({ created_at: -1, _id: -1 }).lean();
    return res.json({
      success: true,
      enquiries: enquiries.map(e => ({ ...e, id: e._id.toString() })),
    });
  } catch (err) {
    console.error('Error fetching enquiries:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve inquiries.' });
  }
});

/**
 * GET /api/admin/enquiries/:id
 */
router.get('/enquiries/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid enquiry ID format.' });
    }
    const enquiry = await ContactEnquiry.findById(id).lean();
    if (!enquiry) {
      return res.status(404).json({ success: false, error: 'Enquiry not found.' });
    }
    return res.json({ success: true, enquiry: { ...enquiry, id: enquiry._id.toString() } });
  } catch (err) {
    console.error('Error fetching enquiry details:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve enquiry.' });
  }
});

/**
 * PATCH /api/admin/enquiries/:id
 */
router.patch('/enquiries/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid enquiry ID format.' });
    }
    const { status, private_notes, assigned_to } = req.body;

    const existing = await ContactEnquiry.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Enquiry not found.' });
    }

    const validStatuses = ['New', 'Contacted', 'In Progress', 'Converted', 'Closed'];
    if (status && validStatuses.includes(status)) existing.status = status;
    if (private_notes !== undefined) existing.private_notes = private_notes;
    if (assigned_to !== undefined) existing.assigned_to = assigned_to;

    await existing.save();
    const doc = existing.toObject();
    return res.json({ success: true, enquiry: { ...doc, id: doc._id.toString() } });
  } catch (err) {
    console.error('Error updating enquiry:', err);
    return res.status(500).json({ success: false, error: 'Failed to update enquiry.' });
  }
});

/**
 * DELETE /api/admin/enquiries/:id
 */
router.delete('/enquiries/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid enquiry ID format.' });
    }
    await ContactEnquiry.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Enquiry deleted successfully.' });
  } catch (err) {
    console.error('Error deleting enquiry:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete enquiry.' });
  }
});

/**
 * GET /api/admin/contact-settings
 */
router.get('/contact-settings', async (req, res) => {
  try {
    const settings = await ContactSettings.findOne().lean();
    if (!settings) {
      return res.status(404).json({ success: false, error: 'Contact settings not found.' });
    }
    return res.json({
      success: true,
      settings: {
        ...settings,
        id: settings._id.toString(),
      },
    });
  } catch (err) {
    console.error('Error fetching contact settings:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch contact settings.' });
  }
});

/**
 * PUT /api/admin/contact-settings
 */
router.put('/contact-settings', async (req, res) => {
  try {
    const { email, phone, address, business_hours, social_links } = req.body;
    if (!email || !phone) {
      return res.status(400).json({ success: false, error: 'Email and phone are required.' });
    }

    const updated = await ContactSettings.findOneAndUpdate(
      {},
      {
        email: email.trim(),
        phone: phone.trim(),
        address: (address || '').trim(),
        business_hours: (business_hours || '').trim(),
        social_links: typeof social_links === 'string' ? JSON.parse(social_links) : (social_links || {}),
      },
      { new: true, upsert: true }
    ).lean();

    return res.json({
      success: true,
      settings: {
        ...updated,
        id: updated._id.toString(),
      },
      message: 'Contact settings updated successfully in MongoDB.',
    });
  } catch (err) {
    console.error('Error updating contact settings:', err);
    return res.status(500).json({ success: false, error: 'Failed to update contact settings.' });
  }
});

export default router;
