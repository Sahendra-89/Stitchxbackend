import mongoose from 'mongoose';

// 1. Review Model
const reviewSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, default: 'Client' },
  company: { type: String, required: true },
  review: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5, default: 5 },
  avatar: { type: String, default: '' },
  status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'approved' },
  is_published: { type: Boolean, default: true },
  display_order: { type: Number, default: 0 },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);

// 2. BlogPost Model
const blogPostSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, default: 'AI' },
  author: { type: String, default: 'StitchX Global Technology Team' },
  date: { type: String, default: '' },
  image: { type: String, default: '' },
  excerpt: { type: String, default: '' },
  content: { type: String, required: true },
  tags: { type: String, default: '' },
  seo_title: { type: String, default: '' },
  seo_description: { type: String, default: '' },
  status: { type: String, enum: ['published', 'draft', 'archived'], default: 'published' },
  is_published: { type: Boolean, default: true },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const BlogPost = mongoose.models.BlogPost || mongoose.model('BlogPost', blogPostSchema);

// 3. Job Model
const jobSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  department: { type: String, required: true },
  location: { type: String, default: 'Hybrid / Gurugram or Remote (India)' },
  job_type: { type: String, default: 'Full-time' },
  experience: { type: String, default: '' },
  salary_range: { type: String, default: '' },
  application_deadline: { type: String, default: '' },
  short_description: { type: String, required: true },
  responsibilities: { type: [String], default: [] },
  requirements: { type: [String], default: [] },
  nice_to_have: { type: [String], default: [] },
  benefits: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'closed', 'archived'], default: 'active' },
  is_published: { type: Boolean, default: true },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

// 4. JobApplication Model
const jobApplicationSchema = new mongoose.Schema({
  job_id: { type: String, required: true },
  job_title: { type: String, required: true },
  full_name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  experience: { type: String, default: '' },
  resume_url: { type: String, required: true },
  resume_filename: { type: String, default: '' },
  portfolio_url: { type: String, default: '' },
  status: { type: String, enum: ['New', 'Under Review', 'Shortlisted', 'Rejected', 'Hired'], default: 'New' },
  internal_notes: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const JobApplication = mongoose.models.JobApplication || mongoose.model('JobApplication', jobApplicationSchema);

// 5. ContactEnquiry Model
const contactEnquirySchema = new mongoose.Schema({
  name: { type: String, required: true },
  first_name: { type: String, default: '' },
  last_name: { type: String, default: '' },
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  company_name: { type: String, default: '' },
  service: { type: String, required: true },
  budget: { type: String, default: '' },
  message: { type: String, required: true },
  status: { type: String, enum: ['New', 'Contacted', 'In Progress', 'Converted', 'Closed'], default: 'New' },
  private_notes: { type: String, default: '' },
  assigned_to: { type: String, default: '' },
  ip_address: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const ContactEnquiry = mongoose.models.ContactEnquiry || mongoose.model('ContactEnquiry', contactEnquirySchema);

// 6. ContactSettings Model
const contactSettingsSchema = new mongoose.Schema({
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  business_hours: { type: String, required: true },
  social_links: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const ContactSettings = mongoose.models.ContactSettings || mongoose.model('ContactSettings', contactSettingsSchema);

// 7. AdminUser Model
const adminUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password_hash: { type: String, required: true, select: false },
  salt: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['owner', 'admin', 'accountant', 'doc_manager', 'viewer'],
    default: 'admin',
  },
  failed_login_attempts: { type: Number, default: 0 },
  locked_until: { type: Date, default: null },
  last_login_at: { type: Date, default: null },
  last_login_ip: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', adminUserSchema);

// 8. AdminSession Model (with automated MongoDB TTL expiration)
const adminSessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  user_id: { type: String, required: true },
  username: { type: String, required: true },
  expires_at: { type: Date, required: true, expires: 0 }, // TTL index auto-deletes expired records
  created_ip: { type: String, default: '' },
  user_agent: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const AdminSession = mongoose.models.AdminSession || mongoose.model('AdminSession', adminSessionSchema);

// StitchX Document Management Models
export * from './documentModels.js';

