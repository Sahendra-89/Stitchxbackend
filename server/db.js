import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {
  Review,
  BlogPost,
  Job,
  JobApplication,
  ContactEnquiry,
  ContactSettings,
  AdminUser,
  AdminSession,
  CompanySettings,
  DocumentCounter,
  DocClient,
  RateCard,
  DocQuotation,
  DocProposal,
  DocAgreement,
  DocInvoice,
  DocPayment,
  StoredDocument,
  ActivityLog,
} from './models/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directories for uploaded files
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const resumesDir = path.join(dataDir, 'resumes');
const documentsDir = path.join(dataDir, 'documents');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(resumesDir)) fs.mkdirSync(resumesDir, { recursive: true });
if (!fs.existsSync(documentsDir)) fs.mkdirSync(documentsDir, { recursive: true });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/techfusion';

function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@.+)/i, '$1***$2');
}

let isConnected = false;

/**
 * Connect to MongoDB and seed baseline data if collections are empty.
 */
export async function connectDatabase() {
  if (isConnected) return;

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to ${maskMongoUri(MONGODB_URI)}`);

    await seedBaselineData();
  } catch (err) {
    console.error('[MongoDB] Connection error:', err.message);
  }
}

/**
 * Seed baseline data for initial application setup.
 */
async function seedBaselineData() {
  // 1. Seed Admin User
  const adminCount = await AdminUser.countDocuments();
  if (adminCount === 0) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync('AdminPassword2026!', salt, 64).toString('hex');
    await AdminUser.create({
      username: 'admin',
      password_hash: hash,
      salt,
      role: 'admin',
    });
    console.log('[MongoDB] Seeded default admin account: "admin"');
  }

  // 2. Seed Contact Settings
  const settingsCount = await ContactSettings.countDocuments();
  if (settingsCount === 0) {
    await ContactSettings.create({
      email: 'sahendra2976@gmail.com',
      phone: '+91 93416 60370',
      address: 'Tower A, 3rd Floor, Unitech Cyber Park, Sector 39, Gurugram, Haryana, India',
      business_hours: 'Mon - Fri, 9:00 AM - 6:00 PM IST',
      social_links: {
        linkedin: 'https://linkedin.com/company/stitchx',
        twitter: 'https://twitter.com/stitchx',
        github: 'https://github.com/stitchx',
        instagram: 'https://instagram.com/stitchx',
      },
    });
    console.log('[MongoDB] Seeded initial contact settings');
  }

  // 3. Seed Verified Reviews
  const reviewsCount = await Review.countDocuments();
  if (reviewsCount === 0) {
    const initialReviews = [
      {
        name: "Sarah Jenkins",
        role: "CEO",
        company: "HealthNova",
        avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80",
        rating: 5,
        review: "StitchX Global Technology delivered our patient monitoring mobile app on schedule with exceptional engineering discipline. They translated strict clinical specifications into an intuitive interface, and sprint communication was transparent from week one.",
        display_order: 1,
        status: 'approved',
        is_published: true,
      },
      {
        name: "David Chen",
        role: "CTO",
        company: "EduGrowth",
        avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80",
        rating: 5,
        review: "The technical depth at StitchX Global Technology is evident in their architectural decisions. They built a scalable learning platform that comfortably handles our peak concurrent exam loads without performance dips.",
        display_order: 2,
        status: 'approved',
        is_published: true,
      },
      {
        name: "Emily Rodriguez",
        role: "Marketing Director",
        company: "StyleStore",
        avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80",
        rating: 5,
        review: "Our mobile store performance and checkout conversion improved significantly after StitchX Global Technology rebuilt our platform on a headless architecture. They prioritized sub-second response times and clean UX that directly improved our margins.",
        display_order: 3,
        status: 'approved',
        is_published: true,
      },
      {
        name: "Michael Chang",
        role: "Operations Manager",
        company: "LogiFlow Inc.",
        avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80",
        rating: 5,
        review: "The custom operations platform automated several manual handoffs across our dispatch network. Our operations team saves hours every week with a measurable reduction in dispatch discrepancies.",
        display_order: 4,
        status: 'approved',
        is_published: true,
      },
      {
        name: "Amanda Patel",
        role: "Founder",
        company: "FinMetrics",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80",
        rating: 5,
        review: "We required a real-time analytics dashboard with strict latency constraints, and StitchX Global Technology executed cleanly. Their attention to schema design, query caching, and performance profiling made them a dependable engineering partner.",
        display_order: 5,
        status: 'approved',
        is_published: true,
      },
    ];

    await Review.insertMany(initialReviews);
    console.log('[MongoDB] Seeded initial verified client reviews');
  }

  // 4. Seed Blog Posts
  const blogCount = await BlogPost.countDocuments();
  if (blogCount === 0) {
    const initialPosts = [
      {
        slug: 'future-of-ai-in-software-development',
        title: 'Pragmatic AI Integration: Moving Beyond Autocomplete in Production Systems',
        category: 'AI',
        author: 'Aarav Mehta, Lead Systems Architect',
        date: 'Oct 15, 2026',
        image: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80',
        excerpt: 'How engineering teams can integrate LLMs, vector search, and structured retrieval into production pipelines without sacrificing determinism, latency, or compliance.',
        content: `<p>Integrating large language models into commercial software requires moving past conversational gimmicks and focusing on predictable, auditable workflows. In enterprise environments, non-deterministic responses, variable latencies, and hallucination risks require structured engineering guardrails.</p><h3>1. Retrieval-Augmented Generation (RAG) vs. Costly Fine-Tuning</h3><p>For most enterprise domains, naive fine-tuning introduces training pipeline maintenance and knowledge cutoffs without solving accuracy. Instead, production architectures pair hybrid vector-lexical search (using pgvector or Qdrant) with contextual re-ranking to ground model inputs in validated enterprise data.</p><h3>2. Deterministic Schema Enforcement with Typed Validation</h3><p>Every response consumed by downstream databases or APIs must pass strict schema validation (via Zod or Pydantic). By constraining generation to structured JSON schemas with fallback retries, teams eliminate unexpected parsing exceptions across client-facing interfaces.</p><h3>3. Latency Budgeting & Streaming Fallbacks</h3><p>Because generative API calls can span hundreds of milliseconds, user experience relies on streaming chunks via Server-Sent Events (SSE) alongside optimistic UI updates and aggressive semantic caching for recurrent user queries.</p>`,
        tags: 'AI, LLM, RAG, Python, Architecture',
        seo_title: 'Pragmatic AI Integration in Production Systems | StitchX Insights',
        seo_description: 'Discover how modern engineering teams safely integrate LLMs, vector search, and structured schema retrieval without sacrificing latency or data security.',
        status: 'published',
        is_published: true,
      },
      {
        slug: 'why-react-is-still-king-in-2026',
        title: 'Architecting for Core Web Vitals with React 19 and Next.js App Router',
        category: 'Web Development',
        author: 'Neha Sharma, Principal Frontend Engineer',
        date: 'Sep 28, 2026',
        image: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?auto=format&fit=crop&q=80',
        excerpt: 'A practical breakdown of React Server Components, streaming SSR, and edge caching strategies that consistently achieve sub-second Largest Contentful Paint (LCP).',
        content: `<p>Building high-traffic web applications today requires balancing rich interactive client behavior with aggressive bundle-size reduction. React 19 and the Next.js App Router shift the architectural default from heavy client-side bundles to server-rendered component trees.</p><h3>Zero-Bundle-Size Server Components</h3><p>React Server Components execute entirely on the server, allowing developers to query databases and read internal APIs directly inside components without shipping a single byte of dependencies to the user's browser. This drastically reduces Total Blocking Time (TBT) on mobile devices.</p><h3>Edge Streaming and Selective Hydration</h3><p>With React Suspense boundaries, slow third-party widgets or intensive data feeds no longer block the initial document render. Critical viewport content renders instantaneously, while slower data streams seamlessly as it resolves.</p><h3>Cache Invalidation and Stale-While-Revalidate</h3><p>Combining tag-based cache revalidation at CDN edge nodes ensures static-level response latencies (under 40ms) while guaranteeing that users always view synchronized, updated data within seconds of a production mutation.</p>`,
        tags: 'React, Next.js, Performance, Web Development',
        seo_title: 'Architecting Core Web Vitals with React 19 | StitchX Insights',
        seo_description: 'Sub-second LCP and zero client bundle size: an engineering guide to React 19 Server Components and streaming SSR.',
        status: 'published',
        is_published: true,
      },
      {
        slug: 'building-scalable-mobile-apps-with-react-native',
        title: 'Cross-Platform Mobile Performance: Profiling Flutter & React Native at Scale',
        category: 'Mobile Apps',
        author: 'Vikram Joshi, Mobile Engineering Lead',
        date: 'Sep 10, 2026',
        image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&q=80',
        excerpt: 'Strategies for maintaining 60 FPS render performance, managing offline SQLite synchronization, and mitigating memory leaks in enterprise mobile applications.',
        content: `<p>Cross-platform frameworks have matured to deliver near-native execution performance. However, maintaining 60 frames per second across diverse hardware demands intentional architectural discipline and careful thread lifecycle management.</p><h3>Eliminating UI Thread Bottlenecks</h3><p>In high-frequency data feeds—such as live trading or logistics telematics—uncontrolled UI re-renders can starve the main UI thread. Leveraging modern rendering architectures (like React Native's Fabric engine and Flutter's Impeller backend) ensures GPU-accelerated frame composition without micro-stutters.</p><h3>Resilient Offline-First Data Synchronization</h3><p>Mobile networks are inherently unreliable. Robust enterprise applications treat local embedded databases (SQLite or WatermelonDB) as the single source of truth, queueing outbound mutations with idempotent transaction keys and background synchronization workers.</p><h3>Memory Profiling and Asset Lifecycle</h3><p>Long user sessions often expose hidden retain cycles in image caches and detached listeners. Rigorous automated memory profiling in staging environments prevents device overheating, app termination, and unhandled memory pressure crashes.</p>`,
        tags: 'Mobile, React Native, Flutter, Performance, iOS, Android',
        seo_title: 'Profiling Flutter & React Native Performance at Scale | StitchX',
        seo_description: 'Learn how our mobile engineers achieve 60 FPS and reliable offline sync across millions of daily active sessions.',
        status: 'published',
        is_published: true,
      },
      {
        slug: 'how-business-automation-saves-time',
        title: 'Eliminating Operational Overhead with Event-Driven Backend Pipelines',
        category: 'Business Automation',
        author: 'Rohan Gupta, Solutions Architect',
        date: 'Aug 22, 2026',
        image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80',
        excerpt: 'How decoupled microservices and idempotent event queues turn manual multi-step back-office procedures into reliable, auditable automated workflows.',
        content: `<p>Manual administrative tasks—such as re-keying invoice data between ERPs, verifying customer onboarding checklists, or generating weekly financial reconciliations—cost growing companies hundreds of productive engineering and operations hours every month.</p><h3>Decoupled Event Queues vs. Fragile Synchronous Webhooks</h3><p>Traditional webhook triggers fail when downstream services encounter temporary rate limits or outages. By queueing events into resilient message brokers (like Redis Streams or AWS SQS), automation pipelines guarantee message delivery with exponential backoff and dead-letter queues.</p><h3>Idempotent Execution & Data Integrity</h3><p>A mission-critical automation pipeline must never process a transaction twice. Enforcing cryptographic idempotency keys on every outbound job ensures billing, record creation, and customer emails fire exactly once, even during network retries.</p><h3>Real-Time Operational Audit Logs</h3><p>Replacing spreadsheet workflows with software automation provides complete, auditable traceability. Every triggered action records timestamps, payload hashes, and execution status into centralized monitoring dashboards for effortless governance.</p>`,
        tags: 'Automation, Microservices, Event Driven, Cloud, Queues',
        seo_title: 'Event-Driven Backend Automation Architecture | StitchX',
        seo_description: 'Automate high-friction business operations with resilient event queues and idempotent processing pipelines.',
        status: 'published',
        is_published: true,
      },
    ];

    await BlogPost.insertMany(initialPosts);
    console.log('[MongoDB] Seeded initial engineering blog posts');
  }

  // 5. Seed Jobs
  const jobsCount = await Job.countDocuments();
  if (jobsCount === 0) {
    const initialJobs = [
      {
        id: 'frontend-developer',
        title: 'Senior Frontend Engineer (React / Next.js)',
        department: 'Engineering',
        experience: '3-5 Years',
        job_type: 'Full-time',
        location: 'Hybrid / Gurugram or Remote (India)',
        salary_range: '₹18,00,000 - ₹28,00,000 PA',
        application_deadline: '2026-12-31',
        short_description: 'Architect modular frontend applications, design systems, and responsive web clients using React 19, Next.js, and TypeScript.',
        responsibilities: [
          'Architect maintainable, component-driven web interfaces using React, Next.js, and TypeScript',
          'Implement pixel-accurate, accessible UI components adhering to WCAG 2.1 AA standards',
          'Optimize web performance, Core Web Vitals, and client-side caching strategies',
          'Collaborate with backend engineers to define and consume typed REST and GraphQL APIs',
        ],
        requirements: [
          'Strong command of modern JavaScript/TypeScript, DOM performance, and state management patterns',
          'Demonstrated experience building production applications with React and Next.js (App Router)',
          'Proven track record optimizing Lighthouse scores, bundle sizes, and Core Web Vitals',
          'Proficiency with automated unit/integration testing (Vitest, Jest, React Testing Library)',
        ],
        nice_to_have: [
          'Experience with Tailwind CSS and Radix UI / Headless UI component primitives',
          'Familiarity with SSR edge middleware and server actions',
          'Contributions to open-source UI libraries or developer tooling',
        ],
        benefits: [
          'Competitive market salary with performance reviews',
          'Comprehensive health and medical insurance',
          'Flexible hybrid / remote working flexibility',
          'Annual learning, conference, and book budget',
        ],
        status: 'active',
        is_published: true,
      },
      {
        id: 'backend-developer',
        title: 'Backend Systems Engineer (Node.js / Python)',
        department: 'Engineering',
        experience: '3-6 Years',
        job_type: 'Full-time',
        location: 'Hybrid / Gurugram or Remote (India)',
        salary_range: '₹20,00,000 - ₹32,00,000 PA',
        application_deadline: '2026-12-31',
        short_description: 'Design resilient microservices, distributed transaction pipelines, and high-throughput databases using Node.js, Python, and PostgreSQL.',
        responsibilities: [
          'Design, develop, and scale RESTful and event-driven backend microservices in Node.js / Python',
          'Model relational schemas in PostgreSQL and configure caching layers with Redis',
          'Implement OAuth2, JWT authentication, RBAC, and OWASP-compliant security protocols',
          'Automate containerized CI/CD pipelines and deployment orchestration with Docker and AWS',
        ],
        requirements: [
          'Solid foundations in data structures, concurrency, distributed systems, and API design',
          'In-depth hands-on experience with Node.js, TypeScript, Express/Fastify, or Python (FastAPI)',
          'Strong proficiency with PostgreSQL, including indexing, query optimization, and transactions',
          'Experience with Redis caching, message queues (RabbitMQ/Kafka), and asynchronous jobs',
        ],
        nice_to_have: [
          'Hands-on experience with AWS services (ECS, RDS, S3, CloudFront, Lambda)',
          'Familiarity with Infrastructure as Code (Terraform or Pulumi)',
          'Knowledge of database migration frameworks and zero-downtime cutover patterns',
        ],
        benefits: [
          'Competitive market compensation package',
          'Comprehensive medical insurance coverage',
          'Modern workstation budget / remote setup allowance',
          'Direct mentorship with seasoned engineering leadership',
        ],
        status: 'active',
        is_published: true,
      },
      {
        id: 'ui-ux-designer',
        title: 'Product & UI/UX Designer',
        department: 'Design',
        experience: '3-5 Years',
        job_type: 'Full-time',
        location: 'Hybrid / Gurugram, India',
        salary_range: '₹14,00,000 - ₹22,00,000 PA',
        application_deadline: '2026-11-30',
        short_description: 'Create clean, intuitive product interfaces, design systems, and interaction workflows for high-complexity enterprise and SaaS tools.',
        responsibilities: [
          'Lead end-to-end UX architecture: user journey mapping, wireframing, interactive prototyping, and final design specs',
          'Build and maintain scalable design systems and component libraries in Figma with robust auto-layout tokens',
          'Conduct usability research sessions, heuristic audits, and translate feedback into iterative design improvements',
          'Partner directly with frontend engineers to guarantee high-fidelity design implementation in production',
        ],
        requirements: [
          'Substantial portfolio showing shipped B2B SaaS, mobile, or enterprise web platforms',
          'Expert proficiency in Figma, design tokens, responsive typography, and component variants',
          'Deep understanding of user ergonomics, accessibility (WCAG), and responsive grid layouts',
          'Ability to communicate rational design decisions clearly to cross-functional stakeholders',
        ],
        nice_to_have: [
          'Working knowledge of HTML, CSS, and component structure in React',
          'Experience with micro-animations and prototyping tools (Framer, Principle, Lottie)',
          'Experience designing data-heavy dashboards and complex data visualizations',
        ],
        benefits: [
          'Competitive compensation review schedule',
          'Health and wellness insurance coverage',
          'High-spec hardware and software design toolkit',
          'Collaborative, low-bureaucracy product culture',
        ],
        status: 'active',
        is_published: true,
      },
      {
        id: 'flutter-developer',
        title: 'Mobile Applications Engineer (Flutter / React Native)',
        department: 'Engineering',
        experience: '2-5 Years',
        job_type: 'Full-time',
        location: 'Remote / India',
        salary_range: '₹16,00,000 - ₹25,00,000 PA',
        application_deadline: '2026-12-31',
        short_description: 'Engineer fluid, native-grade mobile applications with offline-first persistence, push notifications, and high-performance render cycles.',
        responsibilities: [
          'Develop and maintain high-performance cross-platform iOS and Android applications using Flutter / Dart',
          'Architect resilient offline-first storage pipelines and background data sync mechanisms',
          'Integrate third-party SDKs, hardware sensor APIs, secure biometrics, and push notifications',
          'Automate build, signing, and release pipelines to Apple App Store and Google Play Store',
        ],
        requirements: [
          'Demonstrated experience shipping production mobile apps to the App Store and Google Play',
          'Strong command of Flutter architecture patterns (BLoC, Riverpod, or Provider) and Dart',
          'Proficiency in REST/WebSocket integration, JSON serialization, and memory leak profiling',
          'Solid understanding of mobile UI performance profiling (60fps render targets)',
        ],
        nice_to_have: [
          'Experience with native mobile development in Swift (iOS) or Kotlin (Android)',
          'Familiarity with Fastlane and mobile CI/CD pipelines',
          'Knowledge of mobile security, cryptographic storage, and certificate pinning',
        ],
        benefits: [
          'Competitive salary with bi-annual performance bonuses',
          'Full family health insurance coverage',
          'Flexible remote working arrangement',
          'Home office setup stipend',
        ],
        status: 'active',
        is_published: true,
      },
    ];

    await Job.insertMany(initialJobs);
    console.log('[MongoDB] Seeded initial job vacancies');
  }

  // 4. Seed StitchX Company Settings
  const companySettingsCount = await CompanySettings.countDocuments();
  if (companySettingsCount === 0) {
    await CompanySettings.create({
      business_name: 'StitchX Global Technology',
      structure: 'Sole proprietorship',
      proprietor_name: '', // Left blank as instructed; editable in settings
      email: 'info@stitchxglobal.com',
      phone: '9341660370',
      address: '',
      website: 'https://stitchxglobal.com',
      currency: 'INR',
      currency_symbol: '₹',
      timezone: 'Asia/Kolkata',
      tax_status: 'not_registered',
      gstin: '',
      prefix_invoice: 'SX/',
      prefix_quotation: 'Q-',
      prefix_proposal: 'P-',
      prefix_agreement: 'SX/NDA/',
      default_payment_terms: 'Payment due within 15 days of invoice date.',
      default_validity_days: 30,
    });
    console.log('[MongoDB] Seeded baseline StitchX Company Settings');
  }

  // 5. Seed Rate Card Services (Initial indicative prices clearly labeled as suggested drafts)
  const rateCardCount = await RateCard.countDocuments();
  if (rateCardCount === 0) {
    const initialServices = [
      {
        service_name: 'Business Website Development',
        category: 'Web Development',
        description: 'Responsive, high-converting corporate website engineered for modern digital branding.',
        pricing_model: 'fixed',
        base_price: 25000,
        currency: 'INR',
        included_features: ['Custom UI/UX Design', 'Mobile-First Responsive Layout', 'On-Page SEO Best Practices', 'Contact Form & Lead Capture', 'Speed & Performance Optimization'],
        exclusions: ['Custom CRM backend development', 'Third-party paid API subscription costs'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
      {
        service_name: 'E-commerce Development',
        category: 'E-commerce',
        description: 'Full-featured online store with catalog management, cart, checkout, and inventory tracking.',
        pricing_model: 'fixed',
        base_price: 45000,
        currency: 'INR',
        included_features: ['Product Catalog & Category Taxonomy', 'Cart & Secure Checkout', 'Payment Gateway Integration', 'Customer Account Dashboard', 'Order & Inventory Management'],
        exclusions: ['Paid payment gateway onboarding fees', 'Product image photography'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
      {
        service_name: 'Mobile App Development',
        category: 'Mobile Development',
        description: 'Cross-platform native-performance iOS & Android mobile application with real-time capabilities.',
        pricing_model: 'fixed',
        base_price: 60000,
        currency: 'INR',
        included_features: ['Cross-Platform Flutter/React Native Build', 'RESTful API Integration', 'Push Notification Infrastructure', 'Offline Data Caching', 'App Store / Play Store Deployment Assistance'],
        exclusions: ['Apple Developer ($99/yr) & Google Play ($25) developer account fees'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
      {
        service_name: 'CRM and Admin Dashboard Development',
        category: 'Enterprise Solutions',
        description: 'Tailored administrative command center with role-based access, data grids, and audit logging.',
        pricing_model: 'fixed',
        base_price: 50000,
        currency: 'INR',
        included_features: ['Role-Based Access Control (RBAC)', 'Interactive Analytics & KPI Cards', 'CRUD Management Tables with Filters', 'Data Export (CSV, Word, PDF)', 'Audit Logs & Security Middleware'],
        exclusions: ['Legacy database migration exceeding 50,000 records'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
      {
        service_name: 'Custom Software',
        category: 'Custom Engineering',
        description: 'Bespoke backend architectures, microservices, and dedicated business logic systems.',
        pricing_model: 'hourly',
        base_price: 1500,
        currency: 'INR',
        included_features: ['Architecture Planning & Schema Modeling', 'Unit & Integration Testing', 'Docker Containerization', 'Automated CI/CD Pipeline Setup'],
        exclusions: ['Cloud infrastructure hosting costs'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
      {
        service_name: 'SEO Services',
        category: 'Digital Marketing',
        description: 'Comprehensive technical and on-page search engine optimization to boost organic rankings.',
        pricing_model: 'monthly',
        base_price: 12000,
        currency: 'INR',
        included_features: ['Keyword Competitor Research', 'Technical Schema & Meta Optimization', 'Core Web Vitals Audit', 'Monthly Ranking & Traffic Audit Report'],
        exclusions: ['Paid Google Ads / PPC management'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
      {
        service_name: 'Hosting and Deployment',
        category: 'DevOps & Cloud',
        description: 'Secure server setup, continuous deployment, automated backups, and 99.9% uptime management.',
        pricing_model: 'monthly',
        base_price: 3500,
        currency: 'INR',
        included_features: ['Cloud VPS / PaaS Provisioning', 'SSL Certificate Management', 'Automated Daily Database Backups', 'Firewall & DDoS Defense Configuration'],
        exclusions: ['Direct cloud infrastructure provider fees (AWS/GCP/DigitalOcean)'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
      {
        service_name: 'Website Maintenance',
        category: 'Maintenance & Support',
        description: 'Ongoing technical maintenance, security vulnerability patching, and SLA response.',
        pricing_model: 'monthly',
        base_price: 5000,
        currency: 'INR',
        included_features: ['Weekly Security & Dependency Updates', 'Uptime Monitoring & Fast Incident Recovery', 'Minor Content & UI Adjustments (up to 5 hrs/mo)', 'Monthly Health & Security Report'],
        exclusions: ['Major architectural overhauls or new module developments'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
      {
        service_name: 'API Integration',
        category: 'Systems Integration',
        description: 'Reliable integration of third-party payment gateways, CRMs, ERPs, and cloud webhooks.',
        pricing_model: 'fixed',
        base_price: 18000,
        currency: 'INR',
        included_features: ['REST/GraphQL API Client Architecture', 'Webhook Endpoint Handlers', 'Payload Validation & Rate Limiting', 'Comprehensive Technical Documentation'],
        exclusions: ['Third-party API license or subscription costs'],
        validity_period: 'Fiscal Year 2026-27',
        status: 'draft_suggestion',
        is_draft_suggestion: true,
      },
    ];
    await RateCard.insertMany(initialServices);
    console.log('[MongoDB] Seeded 9 initial Rate Card services as editable draft suggestions');
  }

  // 6. Ensure Company Settings and documents use standardized Q- and P- prefixes
  try {
    await CompanySettings.updateMany(
      { prefix_proposal: { $in: ['SX/P/', 'SX/P', 'SX/P-'] } },
      { $set: { prefix_proposal: 'P-' } }
    );
    await CompanySettings.updateMany(
      { prefix_quotation: { $in: ['SX/Q/', 'SX/Q', 'SX/Q-'] } },
      { $set: { prefix_quotation: 'Q-' } }
    );
    await CompanySettings.updateMany(
      { address: /Sector 9A\s+,/ },
      { $set: { address: 'Sector 9A, Gurugram' } }
    );

    // Renumber any legacy proposals: SX/P/2026-27/1002 -> P-2026-27-1002
    const legacyProposals = await DocProposal.find({ proposal_number: /^SX\/P/i });
    for (const p of legacyProposals) {
      const newNum = p.proposal_number
        .replace(/^SX\/P\//i, 'P-')
        .replace(/^SX\/P-/i, 'P-')
        .replace(/\/(\d+)$/, '-$1');
      await DocProposal.updateOne({ _id: p._id }, { $set: { proposal_number: newNum } });
      await DocInvoice.updateMany(
        { related_proposal_number: p.proposal_number },
        { $set: { related_proposal_number: newNum } }
      );
      console.log(`[MongoDB] Renumbered proposal ${p.proposal_number} -> ${newNum}`);
    }

    // Renumber any legacy quotations: SX/Q/2026-27/1002 -> Q-2026-27-1002
    const legacyQuotations = await DocQuotation.find({ quotation_number: /^SX\/Q/i });
    for (const q of legacyQuotations) {
      const newNum = q.quotation_number
        .replace(/^SX\/Q\//i, 'Q-')
        .replace(/^SX\/Q-/i, 'Q-')
        .replace(/\/(\d+)$/, '-$1');
      await DocQuotation.updateOne({ _id: q._id }, { $set: { quotation_number: newNum } });
      await DocInvoice.updateMany(
        { related_quotation_number: q.quotation_number },
        { $set: { related_quotation_number: newNum } }
      );
      console.log(`[MongoDB] Renumbered quotation ${q.quotation_number} -> ${newNum}`);
    }
  } catch (migErr) {
    console.warn('[MongoDB] Document prefix normalization note:', migErr.message);
  }
}

// Connect immediately on startup
connectDatabase();

export {
  mongoose,
  Review,
  BlogPost,
  Job,
  JobApplication,
  ContactEnquiry,
  ContactSettings,
  AdminUser,
  AdminSession,
  CompanySettings,
  DocumentCounter,
  DocClient,
  RateCard,
  DocQuotation,
  DocProposal,
  DocAgreement,
  DocInvoice,
  DocPayment,
  StoredDocument,
  ActivityLog,
  dataDir,
  uploadsDir,
  resumesDir,
  documentsDir,
};

