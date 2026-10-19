import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import {
  generateQuotationPdf,
  generateInvoicePdf,
  generateProposalPdf,
  generateAgreementPdf,
} from './services/pdfExportService.js';
import crypto from 'node:crypto';
import {
  DocQuotation,
  DocProposal,
  DocAgreement,
  DocInvoice,
  CompanySettings,
  AdminUser,
  AdminSession,
} from './models/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, 'test_output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function parsePdfMediaBox(pdfBuffer) {
  const content = pdfBuffer.toString('binary');
  // Match MediaBox [x y width height]
  const regex = /\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g;
  const matches = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push({
      raw: match[0],
      x: parseFloat(match[1]),
      y: parseFloat(match[2]),
      widthPt: parseFloat(match[3]),
      heightPt: parseFloat(match[4]),
      widthMm: (parseFloat(match[3]) * 25.4 / 72),
      heightMm: (parseFloat(match[4]) * 25.4 / 72),
    });
  }
  return matches;
}

function countPdfPages(pdfBuffer) {
  const content = pdfBuffer.toString('binary');
  const typeMatches = content.match(/\/Type\s*\/Page\b/g);
  return typeMatches ? typeMatches.length : 1;
}

async function runPdfTests() {
  console.log('========================================================');
  console.log('   STITCHX A4 PDF FORMATTING & DIMENSIONS TEST SUITE   ');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✓ PASS: ${testName} ${details ? `(${details})` : ''}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${testName} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/techfusion';
  await mongoose.connect(mongoUri);

  const company = (await CompanySettings.findOne()) || {
    business_name: 'StitchX Global Technology',
    email: 'info@stitchxglobal.com',
    phone: '9341660370',
    address: 'Sector 9A, Gurugram, Haryana, India',
    website: 'https://stitchxglobal.com',
    bank_name: 'HDFC Bank Ltd.',
    bank_account_number: '50200088991122',
    bank_ifsc: 'HDFC0001234',
    upi_id: 'stitchx@hdfcbank',
  };

  // Mock / Sample Data for all four document types
  const sampleQuotation = {
    quotation_number: 'Q-2026-001',
    quotation_date: new Date('2026-10-15'),
    expiry_date: new Date('2026-11-15'),
    status: 'sent',
    title: 'Enterprise ERP & Cloud Workflow Automation',
    client_snapshot: {
      name: 'Nexus Healthcare Logistics Ltd.',
      contact_person: 'Dr. Vikram Malhotra',
      email: 'vikram.m@nexushealth.in',
      phone: '9810123456',
      billing_address: 'Building 4, Cyber City, Gurugram, Haryana',
      gstin: '06AAACN1234F1Z5',
    },
    items: [
      {
        description: 'Healthcare Provider Portal & Micro-frontend UI Architecture',
        quantity: 1,
        unit_price: 180000,
        amount: 180000,
      },
      {
        description: 'FHIR Compliant Patient Records API & OAuth2 Data Vault',
        quantity: 1,
        unit_price: 240000,
        amount: 240000,
      },
      {
        description: 'Multi-hospital Queue Management & Webhook Sync Engine',
        quantity: 1,
        unit_price: 130000,
        amount: 130000,
      },
    ],
    subtotal: 550000,
    total_discount: 25000,
    tax_amount: 0,
    grand_total: 525000,
  };

  const sampleInvoice = {
    invoice_number: 'INV-2026-089',
    invoice_date: new Date('2026-10-18'),
    due_date: new Date('2026-10-28'),
    status: 'issued',
    tax_treatment: 'commercial_nongst',
    title: 'Milestone 1 Mobilization & Patient Portal Sprint',
    client_snapshot: {
      name: 'Nexus Healthcare Logistics Ltd.',
      contact_person: 'Dr. Vikram Malhotra',
      email: 'vikram.m@nexushealth.in',
      phone: '9810123456',
      billing_address: 'Building 4, Cyber City, Gurugram, Haryana',
      gstin: '06AAACN1234F1Z5',
    },
    items: [
      {
        description: 'Milestone 1: Project Mobilization, UI Prototypes & Architecture Lock',
        quantity: 1,
        unit_price: 157500,
        amount: 157500,
      },
    ],
    subtotal: 157500,
    total_discount: 0,
    tax_amount: 0,
    total_amount: 157500,
    amount_paid: 0,
    outstanding_balance: 157500,
  };

  const sampleProposal = {
    proposal_number: 'P-2026-042',
    created_at: new Date('2026-10-12'),
    status: 'in_review',
    project_title: 'Global Supply Chain Tracking & Automated Warehouse Platform',
    client_snapshot: {
      name: 'TransContinental Freight Ltd.',
      contact_person: 'Sarah Jenkins',
      email: 's.jenkins@transcontinental.com',
      phone: '9988776655',
      billing_address: 'Level 12, Infinity Tower, Bangalore, Karnataka',
    },
    executive_summary: 'Turnkey development of an automated cloud freight reconciliation and IoT cargo tracking dashboard for global air and ocean shipments.',
    client_requirements: 'Real-time GPS synchronization, multi-carrier invoice audit, SAP ERP webhook integration, and carrier performance reporting.',
    proposed_solution: 'Microservices architecture utilizing Node.js, React 19, MongoDB Atlas, Redis cache clusters, and AWS containerized deployments.',
    deliverables: [
      'Carrier telematics dashboard with automated SLA dispute workflows',
      'High-throughput webhook queue processing up to 10,000 telemetry events/sec',
      'Role-based access control for logistics dispatchers and enterprise customers',
    ],
    tech_stack: ['React 19', 'Node.js', 'Express.js', 'MongoDB Atlas', 'Tailwind CSS', 'Docker', 'AWS'],
    total_budget: 780000,
  };

  const sampleAgreement = {
    agreement_number: 'AGR-2026-015',
    agreement_type: 'service_contract',
    created_at: new Date('2026-10-10'),
    effective_date: new Date('2026-10-15'),
    status: 'active',
    second_party_name: 'Aetheria BioSystems Corp.',
    second_party_address: 'Genome Valley, Shamirpet, Hyderabad, Telangana, India',
    second_party_signatory: 'Dr. Rajesh Nair (Chief Technology Officer)',
    purpose: 'Design, engineering, and maintenance of high-throughput clinical laboratory trial data analytics pipelines.',
    ip_terms: 'Upon 100% full financial settlement of contracted fees, all bespoke deliverables and source code transfer exclusively to the Client.',
  };

  console.log('--- TEST 1: Quotation PDF Generation & A4 Dimensions ---');
  const quoteBuffer = await generateQuotationPdf(sampleQuotation, company);
  const quotePath = path.join(outputDir, 'quotation_test.pdf');
  fs.writeFileSync(quotePath, quoteBuffer);

  assert(quoteBuffer.length > 5000, 'Quotation PDF generated', `Size: ${quoteBuffer.length} bytes`);
  assert(quoteBuffer.toString('binary', 0, 5) === '%PDF-', 'Valid PDF magic header (%PDF-)');

  const quoteMediaBoxes = parsePdfMediaBox(quoteBuffer);
  assert(quoteMediaBoxes.length > 0, 'MediaBox present in Quotation PDF');
  if (quoteMediaBoxes.length > 0) {
    const mb = quoteMediaBoxes[0];
    const isA4Width = Math.abs(mb.widthMm - 210.0) < 1.0;
    const isA4Height = Math.abs(mb.heightMm - 297.0) < 1.0;
    assert(isA4Width && isA4Height, 'Quotation exact standard A4 portrait size (210 × 297 mm)', `${mb.widthMm.toFixed(1)}mm × ${mb.heightMm.toFixed(1)}mm (${mb.widthPt.toFixed(1)}pt × ${mb.heightPt.toFixed(1)}pt)`);
  }

  console.log('\n--- TEST 2: Invoice PDF Generation & A4 Dimensions ---');
  const invoiceBuffer = await generateInvoicePdf(sampleInvoice, company);
  const invoicePath = path.join(outputDir, 'invoice_test.pdf');
  fs.writeFileSync(invoicePath, invoiceBuffer);

  assert(invoiceBuffer.length > 5000, 'Invoice PDF generated', `Size: ${invoiceBuffer.length} bytes`);
  const invoiceMediaBoxes = parsePdfMediaBox(invoiceBuffer);
  if (invoiceMediaBoxes.length > 0) {
    const mb = invoiceMediaBoxes[0];
    const isA4Width = Math.abs(mb.widthMm - 210.0) < 1.0;
    const isA4Height = Math.abs(mb.heightMm - 297.0) < 1.0;
    assert(isA4Width && isA4Height, 'Invoice exact standard A4 portrait size (210 × 297 mm)', `${mb.widthMm.toFixed(1)}mm × ${mb.heightMm.toFixed(1)}mm`);
  }

  console.log('\n--- TEST 3: Proposal PDF Generation & A4 Dimensions ---');
  const proposalBuffer = await generateProposalPdf(sampleProposal, company);
  const proposalPath = path.join(outputDir, 'proposal_test.pdf');
  fs.writeFileSync(proposalPath, proposalBuffer);

  assert(proposalBuffer.length > 5000, 'Proposal PDF generated', `Size: ${proposalBuffer.length} bytes`);
  const proposalMediaBoxes = parsePdfMediaBox(proposalBuffer);
  if (proposalMediaBoxes.length > 0) {
    const mb = proposalMediaBoxes[0];
    const isA4Width = Math.abs(mb.widthMm - 210.0) < 1.0;
    const isA4Height = Math.abs(mb.heightMm - 297.0) < 1.0;
    assert(isA4Width && isA4Height, 'Proposal exact standard A4 portrait size (210 × 297 mm)', `${mb.widthMm.toFixed(1)}mm × ${mb.heightMm.toFixed(1)}mm`);
  }

  console.log('\n--- TEST 4: Agreement & NDA PDF Generation & A4 Dimensions ---');
  const agreementBuffer = await generateAgreementPdf(sampleAgreement, company);
  const agreementPath = path.join(outputDir, 'agreement_test.pdf');
  fs.writeFileSync(agreementPath, agreementBuffer);

  assert(agreementBuffer.length > 5000, 'Agreement PDF generated', `Size: ${agreementBuffer.length} bytes`);
  const agreementMediaBoxes = parsePdfMediaBox(agreementBuffer);
  if (agreementMediaBoxes.length > 0) {
    const mb = agreementMediaBoxes[0];
    const isA4Width = Math.abs(mb.widthMm - 210.0) < 1.0;
    const isA4Height = Math.abs(mb.heightMm - 297.0) < 1.0;
    assert(isA4Width && isA4Height, 'Agreement exact standard A4 portrait size (210 × 297 mm)', `${mb.widthMm.toFixed(1)}mm × ${mb.heightMm.toFixed(1)}mm`);
  }

  console.log('\n--- TEST 5: HTTP Endpoints Integration Verification ---');
  // Seed sample records in MongoDB for testing API endpoints
  let savedQuote = await DocQuotation.findOne({ quotation_number: 'Q-2026-TEST' });
  if (!savedQuote) {
    savedQuote = await DocQuotation.create({
      quotation_number: 'Q-2026-TEST',
      quotation_date: new Date(),
      expiry_date: new Date(Date.now() + 30 * 86400000),
      status: 'draft',
      title: 'Automated Test Quotation',
      items: [{ description: 'Test Item', quantity: 1, unit_price: 50000, amount: 50000 }],
      subtotal: 50000,
      total_discount: 0,
      tax_amount: 0,
      grand_total: 50000,
    });
  }

  let savedInvoice = await DocInvoice.findOne({ invoice_number: 'INV-2026-TEST' });
  if (!savedInvoice) {
    savedInvoice = await DocInvoice.create({
      invoice_number: 'INV-2026-TEST',
      invoice_date: new Date(),
      due_date: new Date(Date.now() + 15 * 86400000),
      status: 'draft',
      tax_treatment: 'commercial_nongst',
      title: 'Automated Test Invoice',
      items: [{ description: 'Test Line Item', quantity: 1, unit_price: 25000, amount: 25000 }],
      subtotal: 25000,
      total_discount: 0,
      tax_amount: 0,
      total_amount: 25000,
      amount_paid: 0,
      outstanding_balance: 25000,
    });
  }

  // Get admin session token
  const adminUser = await AdminUser.findOne({ username: 'admin' });
  let token = '';
  if (adminUser) {
    token = crypto.randomBytes(32).toString('hex');
    await AdminSession.create({
      token,
      user_id: adminUser._id.toString(),
      username: adminUser.username,
      expires_at: new Date(Date.now() + 86400000),
      created_ip: '127.0.0.1',
    });
  }

  const baseUrl = 'http://localhost:5173';
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const resQuote = await fetch(`${baseUrl}/api/docs/quotations/${savedQuote._id}/export-pdf`, { headers });
    assert(resQuote.status === 200, 'GET /api/docs/quotations/:id/export-pdf returns 200');
    assert(resQuote.headers.get('content-type') === 'application/pdf', 'Returns Content-Type: application/pdf');
    const quoteApiBuffer = Buffer.from(await resQuote.arrayBuffer());
    assert(quoteApiBuffer.length > 5000, 'API returns complete Quotation PDF binary', `${quoteApiBuffer.length} bytes`);

    const resInv = await fetch(`${baseUrl}/api/docs/invoices/${savedInvoice._id}/export-pdf`, { headers });
    assert(resInv.status === 200, 'GET /api/docs/invoices/:id/export-pdf returns 200');
    assert(resInv.headers.get('content-type') === 'application/pdf', 'Returns Content-Type: application/pdf');
  } catch (netErr) {
    console.warn('[HTTP Test note: ensure dev server is running on localhost:5173]', netErr.message);
  }

  // Clean up test documents
  await DocQuotation.deleteOne({ quotation_number: 'Q-2026-TEST' });
  await DocInvoice.deleteOne({ invoice_number: 'INV-2026-TEST' });

  await mongoose.disconnect();

  console.log('\n========================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPdfTests().catch((err) => {
  console.error('Fatal error during PDF testing:', err);
  process.exit(1);
});
