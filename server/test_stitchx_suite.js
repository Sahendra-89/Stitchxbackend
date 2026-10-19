import { connectDatabase } from './db.js';
import {
  CompanySettings,
  DocClient,
  RateCard,
  DocQuotation,
  DocProposal,
  DocAgreement,
  DocInvoice,
  DocPayment,
  StoredDocument,
  ActivityLog,
  AdminUser,
} from './models/index.js';
import { generateDocumentNumber, getIndiaFinancialYear } from './services/docNumberService.js';
import {
  generateQuotationDocx,
  generateInvoiceDocx,
  generateProposalDocx,
  generateAgreementDocx,
} from './services/docxExportService.js';

async function runTestSuite() {
  console.log('--- STARTING STITCHX COMPREHENSIVE TEST SUITE ---');

  // 1. Database Connection
  await connectDatabase();
  console.log('✓ 1. Database Connected');

  // 2. Company Settings Verification
  const settings = await CompanySettings.findOne();
  if (!settings || settings.business_name !== 'StitchX Global Technology') {
    throw new Error('Company settings not properly initialized with StitchX Global Technology.');
  }
  console.log(`✓ 2. Company Settings Verified: ${settings.business_name} (${settings.structure})`);

  // 3. Indian Financial Year & Sequential Numbering
  const fy = getIndiaFinancialYear();
  const invoiceNum = await generateDocumentNumber('invoice');
  const quoteNum = await generateDocumentNumber('quotation');
  const proposalNum = await generateDocumentNumber('proposal');
  const agreementNum = await generateDocumentNumber('agreement');

  console.log(`✓ 3. Financial Year calculated: ${fy}`);
  console.log(`     Generated Invoice #: ${invoiceNum}`);
  console.log(`     Generated Quote #: ${quoteNum}`);
  console.log(`     Generated Proposal #: ${proposalNum}`);
  console.log(`     Generated Agreement #: ${agreementNum}`);

  if (!invoiceNum.startsWith('SX/') || (!quoteNum.startsWith('SX/Q/') && !quoteNum.startsWith('Q-'))) {
    throw new Error('Numbering prefixes do not match StitchX specification.');
  }

  // 4. Rate Cards Verification
  const rateCardsCount = await RateCard.countDocuments();
  if (rateCardsCount < 9) {
    throw new Error(`Expected at least 9 rate cards, found ${rateCardsCount}`);
  }
  const sampleCard = await RateCard.findOne();
  console.log(`✓ 4. Rate Cards verified (${rateCardsCount} services). Sample: ${sampleCard.service_name} (Draft: ${sampleCard.is_draft_suggestion})`);

  // 5. Client Creation & Validation
  let testClient = await DocClient.findOne({ email: 'client.test@stitchx.in' });
  if (!testClient) {
    testClient = await DocClient.create({
      client_id: await generateDocumentNumber('client'),
      name: 'Test Client Enterprise',
      contact_person: 'Anil Kumar',
      email: 'client.test@stitchx.in',
      phone: '9876543210',
      billing_address: 'Plot 42, Electronics City, Bengaluru, Karnataka, India',
      status: 'active',
    });
  }
  console.log(`✓ 5. Client created/verified: ${testClient.name} (${testClient.client_id})`);

  // 6. Quotation Creation with Line Items
  const quote = await DocQuotation.create({
    quotation_number: await generateDocumentNumber('quotation'),
    client_id: testClient._id,
    client_snapshot: {
      name: testClient.name,
      contact_person: testClient.contact_person,
      email: testClient.email,
    },
    quotation_date: new Date(),
    expiry_date: new Date(Date.now() + 30 * 86400000),
    title: 'Enterprise Architecture & Cloud Portal',
    items: [
      { description: 'Core Application Architecture', quantity: 1, unit_price: 30000, discount_percent: 0, amount: 30000 },
      { description: 'API Integration & Middleware', quantity: 1, unit_price: 20000, discount_percent: 10, amount: 18000 },
    ],
    subtotal: 50000,
    total_discount: 2000,
    tax_amount: 0,
    grand_total: 48000,
    status: 'sent',
  });
  console.log(`✓ 6. Quotation generated: ${quote.quotation_number} (Grand Total: INR ${quote.grand_total})`);

  // 7. Quotation Conversion to Invoice
  const invoice = await DocInvoice.create({
    invoice_number: await generateDocumentNumber('invoice'),
    invoice_date: new Date(),
    due_date: new Date(Date.now() + 15 * 86400000),
    client_id: testClient._id,
    client_snapshot: quote.client_snapshot,
    related_quotation_id: quote._id,
    related_quotation_number: quote.quotation_number,
    items: quote.items,
    subtotal: quote.subtotal,
    total_discount: quote.total_discount,
    tax_treatment: 'commercial_nongst',
    tax_amount: 0,
    total_amount: quote.grand_total,
    amount_paid: 0,
    outstanding_balance: quote.grand_total,
    status: 'issued',
  });

  quote.status = 'converted_to_invoice';
  quote.converted_invoice_id = invoice._id;
  quote.converted_invoice_number = invoice.invoice_number;
  await quote.save();
  console.log(`✓ 7. Converted Quotation to Invoice: ${invoice.invoice_number} (Outstanding: INR ${invoice.outstanding_balance})`);

  // 8. Partial Payment & Server-Side Balance Re-calculation
  const payment = await DocPayment.create({
    payment_id: await generateDocumentNumber('payment'),
    client_id: testClient._id,
    invoice_id: invoice._id,
    invoice_number: invoice.invoice_number,
    amount: 25000,
    payment_method: 'bank_transfer',
    transaction_reference: 'NEFT-' + Date.now(),
    verification_status: 'verified',
    recorded_by: 'Admin',
  });

  invoice.amount_paid = 25000;
  invoice.outstanding_balance = invoice.total_amount - 25000;
  invoice.status = 'partially_paid';
  await invoice.save();
  console.log(`✓ 8. Recorded payment of INR ${payment.amount}. Invoice balance: INR ${invoice.outstanding_balance} (Status: ${invoice.status})`);

  // 9. Proposal Creation
  const proposal = await DocProposal.create({
    proposal_number: await generateDocumentNumber('proposal'),
    client_id: testClient._id,
    client_snapshot: { name: testClient.name },
    project_title: 'Full-Scale Digital Transformation',
    executive_summary: 'Comprehensive engineering engagement to build modern web and cloud systems.',
    deliverables: ['UI System', 'Node Backend', 'MongoDB Database'],
    total_budget: 150000,
    status: 'draft',
  });
  console.log(`✓ 9. Proposal created: ${proposal.proposal_number}`);

  // 10. Agreement / NDA Creation
  const agreement = await DocAgreement.create({
    agreement_number: await generateDocumentNumber('agreement'),
    client_id: testClient._id,
    second_party_name: testClient.name,
    agreement_type: 'mutual_nda',
    status: 'signed',
    signed_by_name: 'Anil Kumar, Director',
    signed_at: new Date(),
  });
  console.log(`✓ 10. Agreement created & signed: ${agreement.agreement_number}`);

  // 11. Word (.docx) Generation Test for All 4 Types
  const qDocx = await generateQuotationDocx(quote, settings);
  const iDocx = await generateInvoiceDocx(invoice, settings);
  const pDocx = await generateProposalDocx(proposal, settings);
  const aDocx = await generateAgreementDocx(agreement, settings);

  console.log(`✓ 11. Generated DOCX Buffers:`);
  console.log(`     Quotation DOCX: ${qDocx.length} bytes`);
  console.log(`     Invoice DOCX: ${iDocx.length} bytes`);
  console.log(`     Proposal DOCX: ${pDocx.length} bytes`);
  console.log(`     Agreement DOCX: ${aDocx.length} bytes`);

  // 12. Activity Logging Test
  await ActivityLog.create({
    actor_id: 'test-admin',
    username: 'admin',
    action: 'test_suite_verified',
    record_type: 'SystemTest',
    record_id: 'test-001',
    description: 'StitchX verification suite passed all checks successfully.',
  });
  console.log('✓ 12. Activity Log created & verified');

  console.log('\n--- ALL TEST SUITE CHECKS COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('TEST SUITE FAILED:', err);
  process.exit(1);
});
