import mongoose from 'mongoose';

// 1. Company Settings Model
const companySettingsSchema = new mongoose.Schema({
  business_name: { type: String, default: 'StitchX Global Technology', required: true },
  structure: { type: String, default: 'Sole proprietorship', required: true },
  proprietor_name: { type: String, default: '' },
  email: { type: String, default: 'info@stitchxglobal.com', required: true },
  phone: { type: String, default: '9341660370', required: true },
  address: { type: String, default: '' },
  website: { type: String, default: 'https://stitchxglobal.com' },
  logo_url: { type: String, default: '/stitchx-logo.png' },
  currency: { type: String, default: 'INR' },
  currency_symbol: { type: String, default: '₹' },
  timezone: { type: String, default: 'Asia/Kolkata' },
  default_payment_terms: { type: String, default: 'Payment due within 15 days of invoice date.' },
  default_validity_days: { type: Number, default: 30 },
  start_sequence: { type: Number, default: 1001 },
  prefix_invoice: { type: String, default: 'SX/' },
  prefix_quotation: { type: String, default: 'Q-' },
  prefix_proposal: { type: String, default: 'P-' },
  prefix_agreement: { type: String, default: 'SX/NDA/' },
  tax_status: { type: String, enum: ['not_registered', 'registered', 'composition'], default: 'not_registered' },
  gstin: { type: String, default: '' },
  pan: { type: String, default: '' },
  bank_name: { type: String, default: '' },
  bank_account_name: { type: String, default: '' },
  bank_account_number: { type: String, default: '' },
  bank_ifsc: { type: String, default: '' },
  bank_branch: { type: String, default: '' },
  upi_id: { type: String, default: '' },
  notes_and_terms: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const CompanySettings = mongoose.models.CompanySettings || mongoose.model('CompanySettings', companySettingsSchema);

// 2. Concurrency-Safe Document Counter Model
const documentCounterSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'invoice', 'quotation', 'proposal', 'agreement', 'client', 'payment'
  financial_year: { type: String, required: true }, // e.g. '2026-27'
  sequence: { type: Number, default: 1000 },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

documentCounterSchema.index({ type: 1, financial_year: 1 }, { unique: true });
export const DocumentCounter = mongoose.models.DocumentCounter || mongoose.model('DocumentCounter', documentCounterSchema);

// 3. Client Model
const clientSchema = new mongoose.Schema({
  client_id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  contact_person: { type: String, default: '', trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true },
  billing_address: { type: String, default: '' },
  service_address: { type: String, default: '' },
  gstin: { type: String, default: '', trim: true, uppercase: true },
  status: { type: String, enum: ['active', 'inactive', 'lead'], default: 'active' },
  notes: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

clientSchema.index({ name: 'text', contact_person: 'text', email: 'text', client_id: 'text' });
export const DocClient = mongoose.models.DocClient || mongoose.model('DocClient', clientSchema);

// 4. Rate Card Model
const rateCardSchema = new mongoose.Schema({
  service_name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  pricing_model: { type: String, enum: ['fixed', 'hourly', 'monthly', 'custom'], default: 'fixed' },
  base_price: { type: Number, required: true, min: 0, default: 0 },
  price_range: { type: String, default: '' },
  currency: { type: String, default: 'INR' },
  included_features: { type: [String], default: [] },
  exclusions: { type: [String], default: [] },
  validity_period: { type: String, default: 'Fiscal Year 2026-27' },
  status: { type: String, enum: ['active', 'inactive', 'draft_suggestion'], default: 'draft_suggestion' },
  is_draft_suggestion: { type: Boolean, default: true },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const RateCard = mongoose.models.RateCard || mongoose.model('RateCard', rateCardSchema);

// 5. Line Item Schema (Embedded)
const lineItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  quantity: { type: Number, default: 1, min: 0.01 },
  unit_price: { type: Number, default: 0, min: 0 },
  discount_percent: { type: Number, default: 0, min: 0, max: 100 },
  tax_rate: { type: Number, default: 0, min: 0 }, // 0% by default unless GST confirmed
  amount: { type: Number, default: 0, min: 0 },
}, { _id: false });

// 6. Quotation Model
const quotationSchema = new mongoose.Schema({
  quotation_number: { type: String, required: true, unique: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocClient' },
  client_snapshot: {
    name: { type: String, default: '' },
    contact_person: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    billing_address: { type: String, default: '' },
    gstin: { type: String, default: '' },
  },
  quotation_date: { type: Date, default: Date.now },
  expiry_date: { type: Date, required: true },
  title: { type: String, default: 'Service Quotation' },
  items: { type: [lineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  total_discount: { type: Number, default: 0 },
  tax_amount: { type: Number, default: 0 },
  grand_total: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  terms_conditions: { type: String, default: '' },
  notes: { type: String, default: '' },
  prepared_by: { type: String, default: 'StitchX Global Technology' },
  company_snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted_to_invoice'],
    default: 'draft',
  },
  converted_invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocInvoice' },
  converted_invoice_number: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const DocQuotation = mongoose.models.DocQuotation || mongoose.model('DocQuotation', quotationSchema);

// 7. Proposal Model
const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true },
  duration: { type: String, default: '' },
  deliverables: { type: String, default: '' },
  fee_percentage: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
}, { _id: false });

const proposalSchema = new mongoose.Schema({
  proposal_number: { type: String, required: true, unique: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocClient' },
  client_snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  project_title: { type: String, required: true },
  executive_summary: { type: String, default: '' },
  client_requirements: { type: String, default: '' },
  proposed_solution: { type: String, default: '' },
  scope_of_work: { type: String, default: '' },
  deliverables: { type: [String], default: [] },
  tech_stack: { type: [String], default: [] },
  milestones: { type: [milestoneSchema], default: [] },
  fees_and_payment_schedule: { type: String, default: '' },
  total_budget: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  assumptions_exclusions: { type: String, default: '' },
  support_maintenance_terms: { type: String, default: '' },
  ip_terms: {
    type: String,
    default: 'Upon 100% receipt of all contracted fees, ownership of bespoke deliverable code is transferred to the Client. Pre-existing frameworks and developer utilities remain the intellectual property of StitchX Global Technology.',
  },
  validity_date: { type: Date },
  acceptance_signature_name: { type: String, default: '' },
  acceptance_date: { type: Date },
  company_snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 },
  status: {
    type: String,
    enum: ['draft', 'in_review', 'sent', 'accepted', 'declined', 'expired'],
    default: 'draft',
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const DocProposal = mongoose.models.DocProposal || mongoose.model('DocProposal', proposalSchema);

// 8. Agreement / NDA Model
const agreementSchema = new mongoose.Schema({
  agreement_number: { type: String, required: true, unique: true },
  agreement_type: {
    type: String,
    enum: ['mutual_nda', 'oneway_nda', 'msa', 'service_contract'],
    default: 'mutual_nda',
  },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocClient' },
  first_party_name: { type: String, default: 'StitchX Global Technology' },
  first_party_address: { type: String, default: '' },
  first_party_signatory: { type: String, default: 'Authorized Signatory' },
  second_party_name: { type: String, required: true },
  second_party_address: { type: String, default: '' },
  second_party_signatory: { type: String, default: '' },
  purpose: {
    type: String,
    default: 'Evaluation of digital product engineering, technical consulting, and prospective commercial software engagements.',
  },
  confidential_info_definition: {
    type: String,
    default: 'All non-public proprietary technology, software source code, specifications, customer data, and business plans disclosed by either party.',
  },
  exclusions: {
    type: String,
    default: 'Information already known prior to disclosure, publicly available without fault, or independently developed.',
  },
  confidentiality_obligations: {
    type: String,
    default: 'Parties agree to exercise commercial reasonable care, prevent unauthorized disclosure to third parties, and utilize confidential materials strictly for the stated Purpose.',
  },
  term_and_survival: {
    type: String,
    default: 'This Agreement remains in effect for two (2) years from execution. Confidentiality covenants survive for three (3) years post-termination.',
  },
  governing_law: {
    type: String,
    default: 'This Agreement shall be governed by and construed in accordance with the Laws of India, subject to the jurisdiction of competent courts in India.',
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'signed', 'rejected', 'expired', 'terminated'],
    default: 'draft',
  },
  signed_document_file_id: { type: mongoose.Schema.Types.ObjectId, ref: 'StoredDocument' },
  signed_at: { type: Date },
  signed_by_name: { type: String, default: '' },
  legal_disclaimer: {
    type: String,
    default: 'Standard digital agency mutual NDA template. Consult legal counsel for specialized multi-jurisdictional contracts.',
  },
  company_snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const DocAgreement = mongoose.models.DocAgreement || mongoose.model('DocAgreement', agreementSchema);

// 9. Invoice Model
const invoiceSchema = new mongoose.Schema({
  invoice_number: { type: String, required: true, unique: true },
  invoice_date: { type: Date, default: Date.now },
  due_date: { type: Date, required: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocClient' },
  client_snapshot: {
    name: { type: String, default: '' },
    contact_person: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    billing_address: { type: String, default: '' },
    gstin: { type: String, default: '' },
  },
  related_quotation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocQuotation' },
  related_quotation_number: { type: String, default: '' },
  related_proposal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocProposal' },
  related_proposal_number: { type: String, default: '' },
  items: { type: [lineItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  total_discount: { type: Number, default: 0 },
  tax_treatment: {
    type: String,
    enum: ['commercial_nongst', 'gst_tax_invoice'],
    default: 'commercial_nongst',
  },
  tax_amount: { type: Number, default: 0 },
  total_amount: { type: Number, default: 0 },
  amount_paid: { type: Number, default: 0 },
  outstanding_balance: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  payment_terms: { type: String, default: 'Payment due within 15 days from issuance.' },
  payment_instructions: { type: String, default: '' },
  notes: { type: String, default: '' },
  company_snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
  },
  issued_at: { type: Date },
  cancelled_reason: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const DocInvoice = mongoose.models.DocInvoice || mongoose.model('DocInvoice', invoiceSchema);

// 10. Payment Model
const paymentSchema = new mongoose.Schema({
  payment_id: { type: String, required: true, unique: true },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocClient' },
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocInvoice', required: true },
  invoice_number: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, default: 'INR' },
  payment_method: {
    type: String,
    enum: ['bank_transfer', 'neft_imps', 'upi', 'cheque', 'cash', 'card', 'payment_gateway', 'other'],
    default: 'bank_transfer',
  },
  transaction_reference: { type: String, default: '', trim: true },
  payment_date: { type: Date, default: Date.now },
  verification_status: {
    type: String,
    enum: ['pending_verification', 'verified', 'rejected'],
    default: 'pending_verification',
  },
  notes: { type: String, default: '' },
  recorded_by: { type: String, default: 'Admin' },
  verified_by: { type: String, default: '' },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const DocPayment = mongoose.models.DocPayment || mongoose.model('DocPayment', paymentSchema);

// 11. Stored Document / File Attachment Model
const storedDocumentSchema = new mongoose.Schema({
  file_id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  original_filename: { type: String, required: true },
  stored_filename: { type: String, required: true },
  mime_type: { type: String, required: true },
  file_size: { type: Number, required: true },
  category: {
    type: String,
    enum: ['quotation', 'proposal', 'nda', 'invoice', 'signed_agreement', 'client_id', 'contract', 'general_attachment'],
    default: 'general_attachment',
  },
  linked_record_type: { type: String, default: '' },
  linked_record_id: { type: String, default: '' },
  client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DocClient' },
  description: { type: String, default: '' },
  uploaded_by: { type: String, default: 'Admin' },
  is_archived: { type: Boolean, default: false },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

export const StoredDocument = mongoose.models.StoredDocument || mongoose.model('StoredDocument', storedDocumentSchema);

// 12. Activity Log / Audit Trail Model
const activityLogSchema = new mongoose.Schema({
  actor_id: { type: String, default: '' },
  username: { type: String, default: 'admin' },
  action: { type: String, required: true },
  record_type: { type: String, default: '' },
  record_id: { type: String, default: '' },
  description: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip_address: { type: String, default: '' },
  created_at: { type: Date, default: Date.now, index: true },
});

export const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);
