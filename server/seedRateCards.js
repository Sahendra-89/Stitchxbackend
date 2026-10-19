import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { CompanySettings, RateCard } from './models/index.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/techfusion';

async function updateOfficialRateCardAndCompany() {
  await mongoose.connect(MONGODB_URI);
  console.log('[MongoDB] Connected for Rate Card & Company Settings update');

  // 1. Update Company Settings
  await CompanySettings.updateOne(
    {},
    {
      $set: {
        business_name: 'StitchX Global Technology',
        structure: 'Sole proprietorship',
        email: 'info@stitchxglobal.com',
        phone: '9341660370',
        address: 'Sector 9A , Gurugram',
      },
    },
    { upsert: true }
  );
  console.log('[MongoDB] Updated Company Settings address to "Sector 9A , Gurugram"');

  // 2. Replace Rate Cards with the 12 official services
  await RateCard.deleteMany({});

  const officialServices = [
    // Category 1: Website & commerce
    {
      service_name: 'Business / static website',
      category: 'Website & commerce',
      description: 'Up to 5 pages; responsive design; contact form',
      pricing_model: 'fixed',
      base_price: 15000,
      price_range: '₹15,000–₹50,000',
      currency: 'INR',
      included_features: [
        'Up to 5 responsive pages',
        'Mobile & tablet optimized design',
        'Contact form with email lead routing',
        'SEO-ready structure & meta tags',
        'Fast static asset loading',
      ],
      exclusions: ['Content copywriting', 'Paid stock imagery'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'Business website with CMS',
      category: 'Website & commerce',
      description: 'Editable content areas; CMS setup depends on platform',
      pricing_model: 'fixed',
      base_price: 25000,
      price_range: '₹25,000–₹75,000',
      currency: 'INR',
      included_features: [
        'Content Management System setup',
        'Custom admin dashboard for blogs/pages',
        'Dynamic page management',
        'User roles and permissions',
        'Training documentation',
      ],
      exclusions: ['Custom plugin development', 'Third-party hosting fees'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'E-commerce website',
      category: 'Website & commerce',
      description: 'Product catalogue, cart, checkout; gateway fees extra',
      pricing_model: 'fixed',
      base_price: 40000,
      price_range: '₹40,000–₹2,00,000+',
      currency: 'INR',
      included_features: [
        'Product catalogue & category filtering',
        'Shopping cart & secure checkout flow',
        'Indian payment gateway integration (Razorpay/UPI)',
        'Order tracking & automated email alerts',
        'Inventory management dashboard',
      ],
      exclusions: ['Payment gateway merchant transaction fees', 'Logistics/courier API fees'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'Landing page',
      category: 'Website & commerce',
      description: 'Single page; copywriting and ad spend excluded',
      pricing_model: 'fixed',
      base_price: 5000,
      price_range: '₹5,000–₹15,000',
      currency: 'INR',
      included_features: [
        'High-converting single-page layout',
        'Lead capture form & CTA integration',
        'Analytics & tracking pixel setup',
        'Speed optimization for paid traffic',
      ],
      exclusions: ['Copywriting and ad campaign budget', 'Domain/hosting fees'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },

    // Category 2: Applications & software
    {
      service_name: 'CRM / admin dashboard',
      category: 'Applications & software',
      description: 'Roles, data views, reports and CRUD modules as scoped',
      pricing_model: 'fixed',
      base_price: 25000,
      price_range: '₹25,000–₹1,00,000+',
      currency: 'INR',
      included_features: [
        'Role-based access control (Admin, Manager, Staff)',
        'Data tables with search, filtering & pagination',
        'CRUD modules for clients & operational records',
        'Export data to CSV/Excel/PDF',
        'Audit activity logs',
      ],
      exclusions: ['Third-party cloud infrastructure subscription costs'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'Android mobile app',
      category: 'Applications & software',
      description: 'Estimate varies by screens, APIs, and device features',
      pricing_model: 'fixed',
      base_price: 50000,
      price_range: '₹50,000–₹2,00,000+',
      currency: 'INR',
      included_features: [
        'Native/hybrid Android application build',
        'REST API backend integration',
        'Push notifications setup',
        'Google Play Store release preparation',
      ],
      exclusions: ['Google Play Developer Console registration fee ($25)'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'Custom software / ERP',
      category: 'Applications & software',
      description: 'Discovery and written scope required',
      pricing_model: 'fixed',
      base_price: 100000,
      price_range: '₹1,00,000+',
      currency: 'INR',
      included_features: [
        'Technical discovery & architectural specification',
        'Multi-module business process automation',
        'Relational/NoSQL database architecture',
        'Enterprise security and data encryption',
        'Dedicated QA & staging testing cycle',
      ],
      exclusions: ['Hardware & dedicated cloud hosting infrastructure'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'API integration / deployment',
      category: 'Applications & software',
      description: 'Depends on providers, security and complexity',
      pricing_model: 'fixed',
      base_price: 5000,
      price_range: '₹5,000–₹25,000+',
      currency: 'INR',
      included_features: [
        'Third-party REST/GraphQL API connection',
        'Secure token authentication & webhook listener',
        'Error handling & payload logging',
        'Staging and production deployment verification',
      ],
      exclusions: ['Provider API subscription & pay-per-call charges'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },

    // Category 3: Digital services & support
    {
      service_name: 'SEO services',
      category: 'Digital services & support',
      description: 'Scope, target locations, content and reporting to be agreed',
      pricing_model: 'monthly',
      base_price: 15000,
      price_range: '₹15,000/month',
      currency: 'INR',
      included_features: [
        'Comprehensive technical SEO site audit',
        'Keyword research & competitor analysis',
        'On-page title, meta, header & URL optimization',
        'Monthly ranking performance & traffic report',
      ],
      exclusions: ['Backlink purchase fees', 'External content writer charges'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'Website maintenance',
      category: 'Digital services & support',
      description: 'Defined hours/tasks; new features quoted separately',
      pricing_model: 'monthly',
      base_price: 6000,
      price_range: '₹6,000–₹15,000/month',
      currency: 'INR',
      included_features: [
        'Weekly security patches & core dependency updates',
        'Regular database & file backups',
        'Uptime monitoring & quick incident resolution',
        'Minor content text and banner updates',
      ],
      exclusions: ['Major new feature additions (quoted separately)'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'Hosting / domain / email',
      category: 'Digital services & support',
      description: 'Provider, renewal and usage charges billed separately',
      pricing_model: 'fixed',
      base_price: 2500,
      price_range: 'At actual cost + agreed service fee',
      currency: 'INR',
      included_features: [
        'DNS record configuration (A, CNAME, MX, SPF, DKIM)',
        'Business email setup on Google Workspace / Zoho',
        'SSL certificate installation & auto-renewal',
        'Server environment provisioning',
      ],
      exclusions: ['Actual registrar domain registration/renewal fees', 'Email mailbox license fees'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
    {
      service_name: 'Emergency / out-of-scope work',
      category: 'Digital services & support',
      description: 'Requires client approval before work starts',
      pricing_model: 'hourly',
      base_price: 800,
      price_range: '₹800–₹1,500/hour',
      currency: 'INR',
      included_features: [
        'Immediate developer allocation for urgent fixes',
        'Direct diagnostics and code triage',
        'Itemized timesheet reporting',
        'Prioritized release to production',
      ],
      exclusions: ['Work conducted without prior written client approval'],
      validity_period: 'Fiscal Year 2026-27',
      status: 'draft_suggestion',
      is_draft_suggestion: true,
    },
  ];

  await RateCard.insertMany(officialServices);
  console.log(`[MongoDB] Successfully seeded ${officialServices.length} official services in Rate Card catalog.`);

  await mongoose.disconnect();
}

updateOfficialRateCardAndCompany().catch((err) => {
  console.error('Error updating rate card:', err);
  process.exit(1);
});
