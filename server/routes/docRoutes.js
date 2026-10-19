import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
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
} from '../models/index.js';
import { requireAdminAuth } from '../auth.js';
import { generateDocumentNumber } from '../services/docNumberService.js';
import { logActivity } from '../services/activityLogger.js';
import {
  generateQuotationDocx,
  generateInvoiceDocx,
  generateProposalDocx,
  generateAgreementDocx,
} from '../services/docxExportService.js';
import {
  generateQuotationPdf,
  generateInvoicePdf,
  generateProposalPdf,
  generateAgreementPdf,
} from '../services/pdfExportService.js';
import {
  documentUpload,
  protectedStorageDir,
} from '../services/documentStorageService.js';
import {
  isStrongPassword,
  getPasswordStrengthError,
  isValidObjectId,
} from '../security/index.js';

const router = express.Router();

// Enforce admin authentication across all Document Management endpoints
router.use(requireAdminAuth);

/**
 * Role-based authorization helper
 */
function requireRoles(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const user = await AdminUser.findById(req.adminSession.user_id);
      const role = user?.role || 'admin';
      if (allowedRoles.includes(role) || role === 'owner' || role === 'admin') {
        req.userRole = role;
        return next();
      }
      return res.status(403).json({
        success: false,
        error: `Access Denied: Your role (${role}) is not authorized for this action.`,
      });
    } catch {
      return res.status(403).json({ success: false, error: 'Authorization check failed.' });
    }
  };
}

/* ==========================================================================
   1. DASHBOARD OVERVIEW & STATISTICS
   ========================================================================== */

router.get('/dashboard-stats', async (req, res) => {
  try {
    const now = new Date();

    // 1. Core metric counts
    const [
      totalClients,
      totalQuotes,
      totalProposals,
      totalAgreements,
      totalInvoices,
      totalFiles,
      draftQuotes,
      draftProposals,
      draftAgreements,
      draftInvoices,
      issuedInvoices,
      awaitingApproval,
    ] = await Promise.all([
      DocClient.countDocuments(),
      DocQuotation.countDocuments(),
      DocProposal.countDocuments(),
      DocAgreement.countDocuments(),
      DocInvoice.countDocuments(),
      StoredDocument.countDocuments({ is_archived: false }),
      DocQuotation.countDocuments({ status: 'draft' }),
      DocProposal.countDocuments({ status: 'draft' }),
      DocAgreement.countDocuments({ status: 'draft' }),
      DocInvoice.countDocuments({ status: 'draft' }),
      DocInvoice.countDocuments({ status: { $in: ['issued', 'partially_paid'] } }),
      DocProposal.countDocuments({ status: 'in_review' }),
    ]);

    const totalDocuments = totalQuotes + totalProposals + totalAgreements + totalInvoices + totalFiles;
    const draftDocuments = draftQuotes + draftProposals + draftAgreements + draftInvoices;

    // 2. Overdue Invoices
    const overdueInvoices = await DocInvoice.countDocuments({
      status: { $in: ['issued', 'partially_paid', 'overdue'] },
      due_date: { $lt: now },
    });

    // 3. Financial aggregates
    const paymentAgg = await DocPayment.aggregate([
      { $match: { verification_status: 'verified' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalPaymentsReceived = paymentAgg[0]?.total || 0;

    const outstandingAgg = await DocInvoice.aggregate([
      { $match: { status: { $in: ['issued', 'partially_paid', 'overdue'] } } },
      { $group: { _id: null, total: { $sum: '$outstanding_balance' } } },
    ]);
    const totalOutstanding = outstandingAgg[0]?.total || 0;

    // 4. Recent records
    const [recentInvoices, recentQuotes, recentProposals, recentAgreements, recentClients, recentPayments] =
      await Promise.all([
        DocInvoice.find().sort({ created_at: -1 }).limit(5).populate('client_id', 'name email'),
        DocQuotation.find().sort({ created_at: -1 }).limit(5).populate('client_id', 'name'),
        DocProposal.find().sort({ created_at: -1 }).limit(5).populate('client_id', 'name'),
        DocAgreement.find().sort({ created_at: -1 }).limit(5).populate('client_id', 'name'),
        DocClient.find().sort({ created_at: -1 }).limit(5),
        DocPayment.find().sort({ payment_date: -1 }).limit(5).populate('client_id', 'name'),
      ]);

    // 5. Upcoming Due Dates
    const upcomingDueInvoices = await DocInvoice.find({
      status: { $in: ['issued', 'partially_paid'] },
      due_date: { $gte: now },
    })
      .sort({ due_date: 1 })
      .limit(5)
      .populate('client_id', 'name');

    // 6. Document status distribution
    const statusDistribution = {
      invoices: {
        draft: draftInvoices,
        issued: issuedInvoices,
        paid: await DocInvoice.countDocuments({ status: 'paid' }),
        overdue: overdueInvoices,
      },
      quotations: {
        draft: draftQuotes,
        sent: await DocQuotation.countDocuments({ status: 'sent' }),
        accepted: await DocQuotation.countDocuments({ status: 'accepted' }),
        converted: await DocQuotation.countDocuments({ status: 'converted_to_invoice' }),
      },
      proposals: {
        draft: draftProposals,
        in_review: awaitingApproval,
        accepted: await DocProposal.countDocuments({ status: 'accepted' }),
      },
      agreements: {
        draft: draftAgreements,
        signed: await DocAgreement.countDocuments({ status: 'signed' }),
        sent: await DocAgreement.countDocuments({ status: 'sent' }),
      },
    };

    return res.json({
      success: true,
      stats: {
        totalDocuments,
        totalClients,
        draftDocuments,
        documentsAwaitingApproval: awaitingApproval,
        issuedInvoices,
        overdueInvoices,
        paymentsReceived: totalPaymentsReceived,
        outstandingAmount: totalOutstanding,
        currency: 'INR',
        currencySymbol: '₹',
      },
      recent: {
        invoices: recentInvoices,
        quotations: recentQuotes,
        proposals: recentProposals,
        agreements: recentAgreements,
        clients: recentClients,
        payments: recentPayments,
        upcomingDueInvoices,
      },
      statusDistribution,
    });
  } catch (err) {
    console.error('[Dashboard Stats Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve dashboard metrics.' });
  }
});

/* ==========================================================================
   2. CLIENT MANAGEMENT
   ========================================================================== */

router.get('/clients', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20, sort = '-created_at' } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contact_person: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { client_id: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [clients, total] = await Promise.all([
      DocClient.find(filter).sort(sort).skip(skip).limit(Number(limit)),
      DocClient.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      clients,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/clients/:id', async (req, res) => {
  try {
    const client = await DocClient.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found.' });

    // Fetch full client document history
    const [quotations, proposals, agreements, invoices, payments, files] = await Promise.all([
      DocQuotation.find({ client_id: client._id }).sort({ created_at: -1 }),
      DocProposal.find({ client_id: client._id }).sort({ created_at: -1 }),
      DocAgreement.find({ client_id: client._id }).sort({ created_at: -1 }),
      DocInvoice.find({ client_id: client._id }).sort({ created_at: -1 }),
      DocPayment.find({ client_id: client._id }).sort({ payment_date: -1 }),
      StoredDocument.find({ client_id: client._id, is_archived: false }).sort({ created_at: -1 }),
    ]);

    return res.json({
      success: true,
      client,
      history: {
        quotations,
        proposals,
        agreements,
        invoices,
        payments,
        files,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/clients', async (req, res) => {
  try {
    const { name, contact_person, email, phone, billing_address, service_address, gstin, notes, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Client or business name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Valid client email address is required.' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid email address format.' });
    }

    // Validate GSTIN format if provided
    if (gstin && gstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(gstin.trim().toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Indian GSTIN format. Valid format is 15 alphanumeric characters (e.g. 07AAAAA0000A1Z5).',
        });
      }
    }

    // Check duplicate email
    const existing = await DocClient.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'A client record with this email address already exists.' });
    }

    const clientId = await generateDocumentNumber('client');

    const client = await DocClient.create({
      client_id: clientId,
      name: name.trim(),
      contact_person: (contact_person || '').trim(),
      email: email.trim().toLowerCase(),
      phone: (phone || '').trim(),
      billing_address: (billing_address || '').trim(),
      service_address: (service_address || '').trim(),
      gstin: (gstin || '').trim().toUpperCase(),
      notes: (notes || '').trim(),
      status: status || 'active',
    });

    await logActivity({
      req,
      action: 'client_created',
      recordType: 'Client',
      recordId: client._id,
      description: `Created client record ${client.name} (${client.client_id})`,
      metadata: { clientId: client.client_id, name: client.name },
    });

    return res.status(201).json({ success: true, client });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/clients/:id', async (req, res) => {
  try {
    const { name, contact_person, email, phone, billing_address, service_address, gstin, notes, status } = req.body;

    const client = await DocClient.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found.' });

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ success: false, error: 'Invalid email address format.' });
      }
    }

    if (gstin && gstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(gstin.trim().toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Indian GSTIN format. Valid format is 15 alphanumeric characters.',
        });
      }
    }

    client.name = name !== undefined ? name.trim() : client.name;
    client.contact_person = contact_person !== undefined ? contact_person.trim() : client.contact_person;
    client.email = email !== undefined ? email.trim().toLowerCase() : client.email;
    client.phone = phone !== undefined ? phone.trim() : client.phone;
    client.billing_address = billing_address !== undefined ? billing_address.trim() : client.billing_address;
    client.service_address = service_address !== undefined ? service_address.trim() : client.service_address;
    client.gstin = gstin !== undefined ? gstin.trim().toUpperCase() : client.gstin;
    client.notes = notes !== undefined ? notes.trim() : client.notes;
    client.status = status !== undefined ? status : client.status;

    await client.save();

    await logActivity({
      req,
      action: 'client_details_changed',
      recordType: 'Client',
      recordId: client._id,
      description: `Updated client details for ${client.name} (${client.client_id})`,
    });

    return res.json({ success: true, client });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/clients/:id', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    const client = await DocClient.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found.' });

    // Prevent accidental deletion if client has issued invoices
    const invoiceCount = await DocInvoice.countDocuments({ client_id: client._id });
    if (invoiceCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete client: ${invoiceCount} invoice(s) are linked to this client. Archive or set status to Inactive instead to preserve historical billing integrity.`,
      });
    }

    await DocClient.findByIdAndDelete(req.params.id);

    await logActivity({
      req,
      action: 'client_deleted',
      recordType: 'Client',
      recordId: req.params.id,
      description: `Deleted client ${client.name} (${client.client_id})`,
    });

    return res.json({ success: true, message: 'Client removed successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   3. RATE CARD MANAGEMENT
   ========================================================================== */

router.get('/rate-cards', async (req, res) => {
  try {
    const { category, status } = req.query;
    const filter = {};
    if (category && category !== 'all') filter.category = category;
    if (status && status !== 'all') filter.status = status;

    const rateCards = await RateCard.find(filter).sort({ category: 1, service_name: 1 });
    return res.json({ success: true, rateCards });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/rate-cards', async (req, res) => {
  try {
    const {
      service_name,
      category,
      description,
      pricing_model,
      base_price,
      price_range,
      currency = 'INR',
      included_features = [],
      exclusions = [],
      validity_period = 'Fiscal Year 2026-27',
      status = 'active',
      is_draft_suggestion = false,
    } = req.body;

    if (!service_name || !category) {
      return res.status(400).json({ success: false, error: 'Service name and category are required.' });
    }

    const item = await RateCard.create({
      service_name: service_name.trim(),
      category: category.trim(),
      description: (description || '').trim(),
      pricing_model: pricing_model || 'fixed',
      base_price: Number(base_price) || 0,
      price_range: (price_range || '').trim(),
      currency,
      included_features: Array.isArray(included_features) ? included_features : [],
      exclusions: Array.isArray(exclusions) ? exclusions : [],
      validity_period: validity_period.trim(),
      status,
      is_draft_suggestion: Boolean(is_draft_suggestion),
    });

    await logActivity({
      req,
      action: 'rate_card_created',
      recordType: 'RateCard',
      recordId: item._id,
      description: `Created rate card entry for ${item.service_name}`,
    });

    return res.status(201).json({ success: true, rateCard: item });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/rate-cards/:id', async (req, res) => {
  try {
    const item = await RateCard.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Rate card item not found.' });

    Object.assign(item, req.body);
    await item.save();

    await logActivity({
      req,
      action: 'rate_card_updated',
      recordType: 'RateCard',
      recordId: item._id,
      description: `Updated rate card entry ${item.service_name}`,
    });

    return res.json({ success: true, rateCard: item });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/rate-cards/:id/duplicate', async (req, res) => {
  try {
    const source = await RateCard.findById(req.params.id);
    if (!source) return res.status(404).json({ success: false, error: 'Rate card not found.' });

    const duplicate = new RateCard({
      ...source.toObject(),
      _id: undefined,
      service_name: `${source.service_name} (Copy)`,
      status: 'draft_suggestion',
      is_draft_suggestion: true,
      created_at: undefined,
      updated_at: undefined,
    });
    await duplicate.save();

    return res.status(201).json({ success: true, rateCard: duplicate });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/rate-cards/:id', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    await RateCard.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Rate card entry deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   4. QUOTATION MANAGEMENT
   ========================================================================== */

/**
 * Server-side recalculation of quotation line items and totals
 */
function calculateQuotationFinancials(items = []) {
  let subtotal = 0;
  let totalDiscount = 0;
  let taxAmount = 0;

  const sanitizedItems = items.map((item) => {
    const qty = Math.max(0.01, Number(item.quantity) || 1);
    const unitPrice = Math.max(0, Number(item.unit_price) || 0);
    const discountPct = Math.min(100, Math.max(0, Number(item.discount_percent) || 0));
    const taxRate = Math.max(0, Number(item.tax_rate) || 0);

    const gross = qty * unitPrice;
    const discount = (gross * discountPct) / 100;
    const net = gross - discount;
    const tax = (net * taxRate) / 100;
    const lineAmount = net + tax;

    subtotal += gross;
    totalDiscount += discount;
    taxAmount += tax;

    return {
      description: (item.description || 'Service item').trim(),
      quantity: qty,
      unit_price: unitPrice,
      discount_percent: discountPct,
      tax_rate: taxRate,
      amount: Math.round(lineAmount * 100) / 100,
    };
  });

  const grandTotal = subtotal - totalDiscount + taxAmount;

  return {
    items: sanitizedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    total_discount: Math.round(totalDiscount * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
    grand_total: Math.round(grandTotal * 100) / 100,
  };
}

router.get('/quotations', async (req, res) => {
  try {
    const { status, client_id, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (client_id) filter.client_id = client_id;
    if (search) {
      filter.$or = [
        { quotation_number: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { 'client_snapshot.name': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [quotations, total] = await Promise.all([
      DocQuotation.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).populate('client_id'),
      DocQuotation.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      quotations,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/quotations/:id', async (req, res) => {
  try {
    const quotation = await DocQuotation.findById(req.params.id).populate('client_id');
    if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found.' });
    return res.json({ success: true, quotation });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/quotations', async (req, res) => {
  try {
    const {
      client_id,
      title = 'Service Quotation',
      quotation_date = new Date(),
      expiry_date,
      items = [],
      terms_conditions,
      notes,
      prepared_by = 'StitchX Global Technology',
      status = 'draft',
    } = req.body;

    if (!client_id) {
      return res.status(400).json({ success: false, error: 'Client selection is required for quotation.' });
    }

    const client = await DocClient.findById(client_id);
    if (!client) {
      return res.status(404).json({ success: false, error: 'Selected client does not exist.' });
    }

    const company = (await CompanySettings.findOne()) || {};
    const quotationNumber = await generateDocumentNumber('quotation', new Date(quotation_date));

    // Calculate expiry date if not provided (default 30 days)
    const validUntil = expiry_date
      ? new Date(expiry_date)
      : new Date(new Date(quotation_date).getTime() + (company.default_validity_days || 30) * 86400000);

    const financials = calculateQuotationFinancials(items);

    const quotation = await DocQuotation.create({
      quotation_number: quotationNumber,
      client_id: client._id,
      client_snapshot: {
        name: client.name,
        contact_person: client.contact_person,
        email: client.email,
        phone: client.phone,
        billing_address: client.billing_address,
        gstin: client.gstin,
      },
      quotation_date: new Date(quotation_date),
      expiry_date: validUntil,
      title: title.trim(),
      items: financials.items,
      subtotal: financials.subtotal,
      total_discount: financials.total_discount,
      tax_amount: financials.tax_amount,
      grand_total: financials.grand_total,
      currency: 'INR',
      terms_conditions: terms_conditions || company.default_payment_terms || '',
      notes: notes || '',
      prepared_by,
      company_snapshot: {
        business_name: company.business_name || 'StitchX Global Technology',
        email: company.email || 'info@stitchxglobal.com',
        phone: company.phone || '9341660370',
      },
      status,
    });

    await logActivity({
      req,
      action: 'document_created',
      recordType: 'Quotation',
      recordId: quotation._id,
      description: `Created quotation ${quotation.quotation_number} for ${client.name}`,
    });

    return res.status(201).json({ success: true, quotation });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/quotations/:id', async (req, res) => {
  try {
    const quotation = await DocQuotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found.' });

    const { title, expiry_date, items, terms_conditions, notes, status, prepared_by } = req.body;

    if (items) {
      const financials = calculateQuotationFinancials(items);
      quotation.items = financials.items;
      quotation.subtotal = financials.subtotal;
      quotation.total_discount = financials.total_discount;
      quotation.tax_amount = financials.tax_amount;
      quotation.grand_total = financials.grand_total;
    }

    if (title) quotation.title = title.trim();
    if (expiry_date) quotation.expiry_date = new Date(expiry_date);
    if (terms_conditions !== undefined) quotation.terms_conditions = terms_conditions;
    if (notes !== undefined) quotation.notes = notes;
    if (status) quotation.status = status;
    if (prepared_by) quotation.prepared_by = prepared_by;

    await quotation.save();

    await logActivity({
      req,
      action: 'document_edited',
      recordType: 'Quotation',
      recordId: quotation._id,
      description: `Updated quotation ${quotation.quotation_number}`,
    });

    return res.json({ success: true, quotation });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/quotations/:id/convert-to-invoice', async (req, res) => {
  try {
    const quotation = await DocQuotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found.' });

    if (quotation.status === 'converted_to_invoice' && quotation.converted_invoice_id) {
      return res.status(400).json({
        success: false,
        error: `This quotation was already converted to invoice ${quotation.converted_invoice_number}.`,
      });
    }

    const company = (await CompanySettings.findOne()) || {};
    const invoiceNumber = await generateDocumentNumber('invoice');
    const dueDate = new Date(Date.now() + 15 * 86400000);

    const invoice = await DocInvoice.create({
      invoice_number: invoiceNumber,
      invoice_date: new Date(),
      due_date: dueDate,
      client_id: quotation.client_id,
      client_snapshot: quotation.client_snapshot,
      related_quotation_id: quotation._id,
      related_quotation_number: quotation.quotation_number,
      items: quotation.items,
      subtotal: quotation.subtotal,
      total_discount: quotation.total_discount,
      tax_treatment: 'commercial_nongst',
      tax_amount: quotation.tax_amount,
      total_amount: quotation.grand_total,
      amount_paid: 0,
      outstanding_balance: quotation.grand_total,
      currency: 'INR',
      payment_terms: company.default_payment_terms || 'Payment due within 15 days of invoice date.',
      payment_instructions: company.bank_account_number
        ? `Bank: ${company.bank_name || ''} | A/C: ${company.bank_account_number} | IFSC: ${company.bank_ifsc || ''} | UPI: ${company.upi_id || ''}`
        : 'Please make payment via verified NEFT / IMPS / UPI.',
      notes: `Generated from accepted quotation ${quotation.quotation_number}.`,
      company_snapshot: {
        business_name: company.business_name || 'StitchX Global Technology',
        email: company.email || 'info@stitchxglobal.com',
        phone: company.phone || '9341660370',
      },
      status: 'draft',
    });

    quotation.status = 'converted_to_invoice';
    quotation.converted_invoice_id = invoice._id;
    quotation.converted_invoice_number = invoice.invoice_number;
    await quotation.save();

    await logActivity({
      req,
      action: 'document_converted',
      recordType: 'Quotation',
      recordId: quotation._id,
      description: `Converted quotation ${quotation.quotation_number} into invoice ${invoice.invoice_number}`,
    });

    return res.status(201).json({ success: true, invoice, quotation });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/quotations/:id/export-docx', async (req, res) => {
  try {
    const quotation = await DocQuotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const buffer = await generateQuotationDocx(quotation, company);

    const safeFilename = `${quotation.quotation_number.replace(/[/\\?%*:|"<>]/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[Export Quotation DOCX Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to generate Word document.' });
  }
});

router.get('/quotations/:id/export-pdf', async (req, res) => {
  try {
    const quotation = await DocQuotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const buffer = await generateQuotationPdf(quotation, company);

    const safeFilename = `${(quotation.quotation_number || 'Quotation').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[Export Quotation PDF Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to generate A4 PDF document.' });
  }
});

router.delete('/quotations/:id', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    await DocQuotation.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Quotation deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   5. PROPOSAL MANAGEMENT
   ========================================================================== */

router.get('/proposals', async (req, res) => {
  try {
    const { status, client_id, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (client_id) filter.client_id = client_id;
    if (search) {
      filter.$or = [
        { proposal_number: { $regex: search, $options: 'i' } },
        { project_title: { $regex: search, $options: 'i' } },
        { 'client_snapshot.name': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [proposals, total] = await Promise.all([
      DocProposal.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).populate('client_id'),
      DocProposal.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      proposals,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/proposals/:id', async (req, res) => {
  try {
    const proposal = await DocProposal.findById(req.params.id).populate('client_id');
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found.' });
    return res.json({ success: true, proposal });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/proposals', async (req, res) => {
  try {
    const {
      client_id,
      project_title,
      executive_summary,
      client_requirements,
      proposed_solution,
      scope_of_work,
      deliverables = [],
      tech_stack = [],
      milestones = [],
      fees_and_payment_schedule,
      total_budget = 0,
      assumptions_exclusions,
      support_maintenance_terms,
      ip_terms,
      validity_date,
      status = 'draft',
    } = req.body;

    if (!client_id || !project_title) {
      return res.status(400).json({ success: false, error: 'Client and Project Title are required.' });
    }

    const client = await DocClient.findById(client_id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const proposalNumber = await generateDocumentNumber('proposal');

    const proposal = await DocProposal.create({
      proposal_number: proposalNumber,
      client_id: client._id,
      client_snapshot: {
        name: client.name,
        contact_person: client.contact_person,
        email: client.email,
        phone: client.phone,
      },
      project_title: project_title.trim(),
      executive_summary: executive_summary || '',
      client_requirements: client_requirements || '',
      proposed_solution: proposed_solution || '',
      scope_of_work: scope_of_work || '',
      deliverables: Array.isArray(deliverables) ? deliverables : [],
      tech_stack: Array.isArray(tech_stack) ? tech_stack : [],
      milestones: Array.isArray(milestones) ? milestones : [],
      fees_and_payment_schedule: fees_and_payment_schedule || '',
      total_budget: Number(total_budget) || 0,
      currency: 'INR',
      assumptions_exclusions: assumptions_exclusions || '',
      support_maintenance_terms: support_maintenance_terms || '',
      ip_terms: ip_terms || undefined,
      validity_date: validity_date ? new Date(validity_date) : undefined,
      company_snapshot: {
        business_name: company.business_name || 'StitchX Global Technology',
        email: company.email || 'info@stitchxglobal.com',
        phone: company.phone || '9341660370',
      },
      status,
    });

    await logActivity({
      req,
      action: 'document_created',
      recordType: 'Proposal',
      recordId: proposal._id,
      description: `Created proposal ${proposal.proposal_number} (${proposal.project_title})`,
    });

    return res.status(201).json({ success: true, proposal });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/proposals/:id', async (req, res) => {
  try {
    const proposal = await DocProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found.' });

    Object.assign(proposal, req.body);
    await proposal.save();

    await logActivity({
      req,
      action: 'document_edited',
      recordType: 'Proposal',
      recordId: proposal._id,
      description: `Updated proposal ${proposal.proposal_number}`,
    });

    return res.json({ success: true, proposal });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/proposals/:id/export-docx', async (req, res) => {
  try {
    const proposal = await DocProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const buffer = await generateProposalDocx(proposal, company);

    const safeFilename = `${proposal.proposal_number.replace(/[/\\?%*:|"<>]/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/proposals/:id/export-pdf', async (req, res) => {
  try {
    const proposal = await DocProposal.findById(req.params.id);
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const buffer = await generateProposalPdf(proposal, company);

    const safeFilename = `${(proposal.proposal_number || 'Proposal').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[Export Proposal PDF Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to generate A4 PDF document.' });
  }
});

router.delete('/proposals/:id', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    await DocProposal.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Proposal deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   6. NDA AND AGREEMENT MANAGEMENT
   ========================================================================== */

router.get('/agreements', async (req, res) => {
  try {
    const { status, agreement_type, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (agreement_type && agreement_type !== 'all') filter.agreement_type = agreement_type;
    if (search) {
      filter.$or = [
        { agreement_number: { $regex: search, $options: 'i' } },
        { second_party_name: { $regex: search, $options: 'i' } },
        { purpose: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [agreements, total] = await Promise.all([
      DocAgreement.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).populate('client_id'),
      DocAgreement.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      agreements,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agreements/:id', async (req, res) => {
  try {
    const agreement = await DocAgreement.findById(req.params.id).populate('client_id');
    if (!agreement) return res.status(404).json({ success: false, error: 'Agreement not found.' });
    return res.json({ success: true, agreement });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/agreements', async (req, res) => {
  try {
    const {
      client_id,
      agreement_type = 'mutual_nda',
      second_party_name,
      second_party_address,
      second_party_signatory,
      purpose,
      confidential_info_definition,
      exclusions,
      confidentiality_obligations,
      term_and_survival,
      governing_law,
      status = 'draft',
    } = req.body;

    if (!second_party_name || !second_party_name.trim()) {
      return res.status(400).json({ success: false, error: 'Second Party (Client/Partner) name is required.' });
    }

    const company = (await CompanySettings.findOne()) || {};
    const agreementNumber = await generateDocumentNumber('agreement');

    const agreement = await DocAgreement.create({
      agreement_number: agreementNumber,
      agreement_type,
      client_id: client_id || undefined,
      first_party_name: company.business_name || 'StitchX Global Technology',
      first_party_address: company.address || '',
      second_party_name: second_party_name.trim(),
      second_party_address: (second_party_address || '').trim(),
      second_party_signatory: (second_party_signatory || '').trim(),
      purpose: purpose || undefined,
      confidential_info_definition: confidential_info_definition || undefined,
      exclusions: exclusions || undefined,
      confidentiality_obligations: confidentiality_obligations || undefined,
      term_and_survival: term_and_survival || undefined,
      governing_law: governing_law || undefined,
      status,
      legal_disclaimer:
        'Notice: This template provides standard digital agency commercial confidentiality provisions. Parties should consult qualified legal counsel for specialized multi-jurisdictional transactions.',
      company_snapshot: {
        business_name: company.business_name || 'StitchX Global Technology',
        email: company.email || 'info@stitchxglobal.com',
        phone: company.phone || '9341660370',
      },
    });

    await logActivity({
      req,
      action: 'document_created',
      recordType: 'Agreement',
      recordId: agreement._id,
      description: `Created ${agreement.agreement_type} (${agreement.agreement_number}) for ${agreement.second_party_name}`,
    });

    return res.status(201).json({ success: true, agreement });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/agreements/:id', async (req, res) => {
  try {
    const agreement = await DocAgreement.findById(req.params.id);
    if (!agreement) return res.status(404).json({ success: false, error: 'Agreement not found.' });

    Object.assign(agreement, req.body);
    await agreement.save();

    await logActivity({
      req,
      action: 'document_edited',
      recordType: 'Agreement',
      recordId: agreement._id,
      description: `Updated agreement ${agreement.agreement_number}`,
    });

    return res.json({ success: true, agreement });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/agreements/:id/mark-signed', async (req, res) => {
  try {
    const { signed_by_name, signed_at = new Date(), signed_document_file_id } = req.body;

    if (!signed_by_name || !signed_by_name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Authorized signatory name is required to verify execution.',
      });
    }

    const agreement = await DocAgreement.findById(req.params.id);
    if (!agreement) return res.status(404).json({ success: false, error: 'Agreement not found.' });

    agreement.status = 'signed';
    agreement.signed_by_name = signed_by_name.trim();
    agreement.signed_at = new Date(signed_at);
    if (signed_document_file_id) agreement.signed_document_file_id = signed_document_file_id;

    await agreement.save();

    await logActivity({
      req,
      action: 'document_signed',
      recordType: 'Agreement',
      recordId: agreement._id,
      description: `Verified execution of agreement ${agreement.agreement_number} signed by ${signed_by_name}`,
    });

    return res.json({ success: true, agreement });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agreements/:id/export-docx', async (req, res) => {
  try {
    const agreement = await DocAgreement.findById(req.params.id);
    if (!agreement) return res.status(404).json({ success: false, error: 'Agreement not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const buffer = await generateAgreementDocx(agreement, company);

    const safeFilename = `${agreement.agreement_number.replace(/[/\\?%*:|"<>]/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agreements/:id/export-pdf', async (req, res) => {
  try {
    const agreement = await DocAgreement.findById(req.params.id);
    if (!agreement) return res.status(404).json({ success: false, error: 'Agreement not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const buffer = await generateAgreementPdf(agreement, company);

    const safeFilename = `${(agreement.agreement_number || 'Agreement').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[Export Agreement PDF Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to generate A4 PDF document.' });
  }
});

router.delete('/agreements/:id', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    await DocAgreement.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Agreement deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   7. INVOICE MANAGEMENT
   ========================================================================== */

/**
 * Server-side recalculation of invoice line items, tax, and balances
 */
function calculateInvoiceFinancials(items = [], taxTreatment = 'commercial_nongst', amountPaid = 0) {
  let subtotal = 0;
  let totalDiscount = 0;
  let taxAmount = 0;

  const sanitizedItems = items.map((item) => {
    const qty = Math.max(0.01, Number(item.quantity) || 1);
    const unitPrice = Math.max(0, Number(item.unit_price) || 0);
    const discountPct = Math.min(100, Math.max(0, Number(item.discount_percent) || 0));

    // Non-GST commercial invoices always have 0 tax rate unless legally registered and explicitly configured
    const effectiveTaxRate = taxTreatment === 'gst_tax_invoice' ? Math.max(0, Number(item.tax_rate) || 0) : 0;

    const gross = qty * unitPrice;
    const discount = (gross * discountPct) / 100;
    const net = gross - discount;
    const tax = (net * effectiveTaxRate) / 100;
    const lineAmount = net + tax;

    subtotal += gross;
    totalDiscount += discount;
    taxAmount += tax;

    return {
      description: (item.description || 'Service delivery item').trim(),
      quantity: qty,
      unit_price: unitPrice,
      discount_percent: discountPct,
      tax_rate: effectiveTaxRate,
      amount: Math.round(lineAmount * 100) / 100,
    };
  });

  const totalAmount = Math.round((subtotal - totalDiscount + taxAmount) * 100) / 100;
  const safeAmountPaid = Math.max(0, Math.min(totalAmount, Number(amountPaid) || 0));
  const outstandingBalance = Math.round((totalAmount - safeAmountPaid) * 100) / 100;

  return {
    items: sanitizedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    total_discount: Math.round(totalDiscount * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
    total_amount: totalAmount,
    amount_paid: safeAmountPaid,
    outstanding_balance: outstandingBalance,
  };
}

router.get('/invoices', async (req, res) => {
  try {
    const { status, client_id, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (client_id) filter.client_id = client_id;
    if (search) {
      filter.$or = [
        { invoice_number: { $regex: search, $options: 'i' } },
        { 'client_snapshot.name': { $regex: search, $options: 'i' } },
        { related_quotation_number: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
      DocInvoice.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).populate('client_id'),
      DocInvoice.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      invoices,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await DocInvoice.findById(req.params.id).populate('client_id');
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    // Fetch payments linked to this invoice
    const payments = await DocPayment.find({ invoice_id: invoice._id }).sort({ payment_date: -1 });

    return res.json({ success: true, invoice, payments });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const {
      client_id,
      invoice_date = new Date(),
      due_date,
      items = [],
      tax_treatment = 'commercial_nongst',
      payment_terms,
      payment_instructions,
      notes,
      related_quotation_id,
      related_proposal_id,
      status = 'draft',
    } = req.body;

    if (!client_id) {
      return res.status(400).json({ success: false, error: 'Client selection is required for invoice.' });
    }

    const client = await DocClient.findById(client_id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found.' });

    const company = (await CompanySettings.findOne()) || {};

    // Validate tax treatment: Cannot generate GST tax invoice unless business tax status is verified
    let safeTaxTreatment = 'commercial_nongst';
    if (tax_treatment === 'gst_tax_invoice') {
      if (company.tax_status !== 'registered' || !company.gstin) {
        return res.status(400).json({
          success: false,
          error:
            'Cannot issue a GST Tax Invoice: StitchX GST registration is unconfirmed or GSTIN is not set in Company Settings. Non-GST Commercial Invoice must be used until the owner verifies tax registration.',
        });
      }
      safeTaxTreatment = 'gst_tax_invoice';
    }

    const invoiceNumber = await generateDocumentNumber('invoice', new Date(invoice_date));
    const calculatedDueDate = due_date
      ? new Date(due_date)
      : new Date(new Date(invoice_date).getTime() + 15 * 86400000);

    const financials = calculateInvoiceFinancials(items, safeTaxTreatment, 0);

    const invoice = await DocInvoice.create({
      invoice_number: invoiceNumber,
      invoice_date: new Date(invoice_date),
      due_date: calculatedDueDate,
      client_id: client._id,
      client_snapshot: {
        name: client.name,
        contact_person: client.contact_person,
        email: client.email,
        phone: client.phone,
        billing_address: client.billing_address,
        gstin: client.gstin,
      },
      related_quotation_id: related_quotation_id || undefined,
      related_proposal_id: related_proposal_id || undefined,
      items: financials.items,
      subtotal: financials.subtotal,
      total_discount: financials.total_discount,
      tax_treatment: safeTaxTreatment,
      tax_amount: financials.tax_amount,
      total_amount: financials.total_amount,
      amount_paid: 0,
      outstanding_balance: financials.total_amount,
      currency: 'INR',
      payment_terms: payment_terms || company.default_payment_terms || 'Payment due within 15 days from issuance.',
      payment_instructions:
        payment_instructions ||
        (company.bank_account_number
          ? `Bank: ${company.bank_name || ''} | Account: ${company.bank_account_number} | IFSC: ${company.bank_ifsc || ''} | UPI: ${company.upi_id || ''}`
          : 'Please transfer to authorized StitchX business account.'),
      notes: notes || '',
      company_snapshot: {
        business_name: company.business_name || 'StitchX Global Technology',
        email: company.email || 'info@stitchxglobal.com',
        phone: company.phone || '9341660370',
        structure: company.structure || 'Sole proprietorship',
      },
      status,
      issued_at: status === 'issued' ? new Date() : undefined,
    });

    await logActivity({
      req,
      action: 'document_created',
      recordType: 'Invoice',
      recordId: invoice._id,
      description: `Created invoice ${invoice.invoice_number} for ${client.name} (Value: INR ${invoice.total_amount})`,
    });

    return res.status(201).json({ success: true, invoice });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/invoices/:id', async (req, res) => {
  try {
    const invoice = await DocInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    // Controlled modification: Prevent silent alteration of core amounts if invoice is already issued or paid
    if (invoice.status === 'paid' && req.body.items) {
      return res.status(400).json({
        success: false,
        error: 'Cannot modify line items on a Paid invoice. Use credit note or adjustments workflow.',
      });
    }

    const { items, due_date, payment_terms, payment_instructions, notes, status, tax_treatment } = req.body;

    if (items) {
      const treatment = tax_treatment || invoice.tax_treatment;
      const financials = calculateInvoiceFinancials(items, treatment, invoice.amount_paid);
      invoice.items = financials.items;
      invoice.subtotal = financials.subtotal;
      invoice.total_discount = financials.total_discount;
      invoice.tax_amount = financials.tax_amount;
      invoice.total_amount = financials.total_amount;
      invoice.outstanding_balance = financials.outstanding_balance;
    }

    if (due_date) invoice.due_date = new Date(due_date);
    if (payment_terms !== undefined) invoice.payment_terms = payment_terms;
    if (payment_instructions !== undefined) invoice.payment_instructions = payment_instructions;
    if (notes !== undefined) invoice.notes = notes;
    if (status) {
      invoice.status = status;
      if (status === 'issued' && !invoice.issued_at) invoice.issued_at = new Date();
    }

    await invoice.save();

    await logActivity({
      req,
      action: 'document_edited',
      recordType: 'Invoice',
      recordId: invoice._id,
      description: `Updated invoice ${invoice.invoice_number}`,
    });

    return res.json({ success: true, invoice });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/invoices/:id/issue', async (req, res) => {
  try {
    const invoice = await DocInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    invoice.status = invoice.amount_paid > 0 ? 'partially_paid' : 'issued';
    invoice.issued_at = new Date();
    await invoice.save();

    await logActivity({
      req,
      action: 'document_issued',
      recordType: 'Invoice',
      recordId: invoice._id,
      description: `Issued invoice ${invoice.invoice_number}`,
    });

    return res.json({ success: true, invoice });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/invoices/:id/cancel', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Cancellation reason is mandatory.' });
    }

    const invoice = await DocInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    invoice.status = 'cancelled';
    invoice.cancelled_reason = reason.trim();
    await invoice.save();

    await logActivity({
      req,
      action: 'document_cancelled',
      recordType: 'Invoice',
      recordId: invoice._id,
      description: `Cancelled invoice ${invoice.invoice_number}. Reason: ${reason.trim()}`,
    });

    return res.json({ success: true, invoice });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/invoices/:id/export-docx', async (req, res) => {
  try {
    const invoice = await DocInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const buffer = await generateInvoiceDocx(invoice, company);

    const safeFilename = `${invoice.invoice_number.replace(/[/\\?%*:|"<>]/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/invoices/:id/export-pdf', async (req, res) => {
  try {
    const invoice = await DocInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    const company = (await CompanySettings.findOne()) || {};
    const buffer = await generateInvoicePdf(invoice, company);

    const safeFilename = `${(invoice.invoice_number || 'Invoice').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[Export Invoice PDF Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to generate A4 PDF document.' });
  }
});

router.delete('/invoices/:id', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    const invoice = await DocInvoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    if (invoice.status === 'issued' || invoice.status === 'paid' || invoice.status === 'partially_paid') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete an active issued or paid invoice. Use the Cancel workflow with an audit reason.',
      });
    }

    await DocInvoice.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Draft invoice deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   8. PAYMENT TRACKING
   ========================================================================== */

router.get('/payments', async (req, res) => {
  try {
    const { client_id, invoice_id, payment_method, verification_status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (client_id) filter.client_id = client_id;
    if (invoice_id) filter.invoice_id = invoice_id;
    if (payment_method && payment_method !== 'all') filter.payment_method = payment_method;
    if (verification_status && verification_status !== 'all') filter.verification_status = verification_status;

    const skip = (Number(page) - 1) * Number(limit);
    const [payments, total] = await Promise.all([
      DocPayment.find(filter)
        .sort({ payment_date: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('client_id', 'name email')
        .populate('invoice_id', 'invoice_number total_amount outstanding_balance'),
      DocPayment.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      payments,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const {
      invoice_id,
      amount,
      payment_method = 'bank_transfer',
      transaction_reference = '',
      payment_date = new Date(),
      notes = '',
      verification_status = 'verified', // manual admin recording can be marked verified or pending
    } = req.body;

    if (!invoice_id || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid invoice and positive payment amount are required.' });
    }

    const invoice = await DocInvoice.findById(invoice_id);
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

    // Check duplicate transaction reference if supplied
    if (transaction_reference && transaction_reference.trim()) {
      const duplicateTxn = await DocPayment.findOne({
        transaction_reference: transaction_reference.trim(),
      });
      if (duplicateTxn) {
        return res.status(400).json({
          success: false,
          error: `A payment with transaction reference "${transaction_reference.trim()}" has already been logged.`,
        });
      }
    }

    const paymentId = await generateDocumentNumber('payment');

    const payment = await DocPayment.create({
      payment_id: paymentId,
      client_id: invoice.client_id,
      invoice_id: invoice._id,
      invoice_number: invoice.invoice_number,
      amount: Number(amount),
      currency: 'INR',
      payment_method,
      transaction_reference: (transaction_reference || '').trim(),
      payment_date: new Date(payment_date),
      verification_status,
      notes: (notes || '').trim(),
      recorded_by: req.adminSession?.username || 'Admin',
      verified_by: verification_status === 'verified' ? req.adminSession?.username || 'Admin' : '',
    });

    // Server-side recalculation of invoice amount paid and balance
    if (verification_status === 'verified') {
      const allVerifiedPayments = await DocPayment.aggregate([
        { $match: { invoice_id: invoice._id, verification_status: 'verified' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const totalPaid = allVerifiedPayments[0]?.total || 0;
      invoice.amount_paid = totalPaid;
      invoice.outstanding_balance = Math.max(0, invoice.total_amount - totalPaid);

      if (invoice.outstanding_balance <= 0) {
        invoice.status = 'paid';
      } else if (invoice.amount_paid > 0) {
        invoice.status = 'partially_paid';
      }
      await invoice.save();
    }

    await logActivity({
      req,
      action: 'payment_recorded',
      recordType: 'Payment',
      recordId: payment._id,
      description: `Recorded payment of INR ${payment.amount} for Invoice ${invoice.invoice_number}`,
      metadata: { paymentId: payment.payment_id, invoiceNumber: invoice.invoice_number, amount: payment.amount },
    });

    return res.status(201).json({ success: true, payment, updatedInvoice: invoice });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/payments/:id/verify', async (req, res) => {
  try {
    const payment = await DocPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: 'Payment record not found.' });

    payment.verification_status = 'verified';
    payment.verified_by = req.adminSession?.username || 'Admin';
    await payment.save();

    // Recalculate invoice
    const invoice = await DocInvoice.findById(payment.invoice_id);
    if (invoice) {
      const allVerified = await DocPayment.aggregate([
        { $match: { invoice_id: invoice._id, verification_status: 'verified' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const totalPaid = allVerified[0]?.total || 0;
      invoice.amount_paid = totalPaid;
      invoice.outstanding_balance = Math.max(0, invoice.total_amount - totalPaid);
      invoice.status = invoice.outstanding_balance <= 0 ? 'paid' : totalPaid > 0 ? 'partially_paid' : invoice.status;
      await invoice.save();
    }

    return res.json({ success: true, payment });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   9. FILE STORAGE & ATTACHMENTS (PROTECTED)
   ========================================================================== */

router.get('/files', async (req, res) => {
  try {
    const { category, client_id, search, page = 1, limit = 20 } = req.query;
    const filter = { is_archived: false };
    if (category && category !== 'all') filter.category = category;
    if (client_id) filter.client_id = client_id;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { original_filename: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [files, total] = await Promise.all([
      StoredDocument.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)).populate('client_id', 'name'),
      StoredDocument.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      files,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/files/upload', (req, res) => {
  documentUpload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    try {
      const { title, category = 'general_attachment', client_id, linked_record_type, linked_record_id, description } =
        req.body;

      const fileId = `DOC-FILE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

      const storedDoc = await StoredDocument.create({
        file_id: fileId,
        title: (title || req.file.originalname).trim(),
        original_filename: req.file.originalname,
        stored_filename: req.file.filename,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        category,
        client_id: client_id || undefined,
        linked_record_type: linked_record_type || '',
        linked_record_id: linked_record_id || '',
        description: description || '',
        uploaded_by: req.adminSession?.username || 'Admin',
      });

      await logActivity({
        req,
        action: 'document_uploaded',
        recordType: 'StoredDocument',
        recordId: storedDoc._id,
        description: `Uploaded document ${storedDoc.title} (${storedDoc.original_filename})`,
      });

      return res.status(201).json({ success: true, file: storedDoc });
    } catch (saveErr) {
      // Clean up file if database record creation fails
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      return res.status(500).json({ success: false, error: saveErr.message });
    }
  });
});

/**
 * Protected file download endpoint: Streams file with authentication enforcement
 */
router.get('/files/:id/download', async (req, res) => {
  try {
    const doc = await StoredDocument.findById(req.params.id);
    if (!doc || doc.is_archived) {
      return res.status(404).json({ success: false, error: 'Document not found or archived.' });
    }

    // Path traversal safety: Verify file is strictly within protectedStorageDir
    const safeFilePath = path.join(protectedStorageDir, doc.stored_filename);
    const resolvedPath = path.resolve(safeFilePath);

    if (!resolvedPath.startsWith(path.resolve(protectedStorageDir))) {
      return res.status(403).json({ success: false, error: 'Security Exception: Path traversal forbidden.' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: 'Document file missing on disk.' });
    }

    await logActivity({
      req,
      action: 'document_downloaded',
      recordType: 'StoredDocument',
      recordId: doc._id,
      description: `Downloaded document ${doc.title} (${doc.file_id})`,
    });

    const safeFilename = doc.original_filename.replace(/[/\\?%*:|"<>]/g, '_');
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    const fileStream = fs.createReadStream(resolvedPath);
    return fileStream.pipe(res);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/files/:id', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    const doc = await StoredDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'File not found.' });

    // Remove file from disk
    const filePath = path.join(protectedStorageDir, doc.stored_filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    await StoredDocument.findByIdAndDelete(req.params.id);

    await logActivity({
      req,
      action: 'document_archived',
      recordType: 'StoredDocument',
      recordId: req.params.id,
      description: `Deleted stored document ${doc.title}`,
    });

    return res.json({ success: true, message: 'File removed successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   10. COMPANY SETTINGS
   ========================================================================== */

router.get('/company-settings', async (req, res) => {
  try {
    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = await CompanySettings.create({
        business_name: 'StitchX Global Technology',
        structure: 'Sole proprietorship',
        email: 'info@stitchxglobal.com',
        phone: '9341660370',
        currency: 'INR',
        currency_symbol: '₹',
        timezone: 'Asia/Kolkata',
      });
    }
    return res.json({ success: true, settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/company-settings', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    let settings = await CompanySettings.findOne();
    if (!settings) settings = new CompanySettings();

    const {
      business_name,
      structure,
      proprietor_name,
      email,
      phone,
      address,
      website,
      logo_url,
      default_payment_terms,
      default_validity_days,
      prefix_invoice,
      prefix_quotation,
      prefix_proposal,
      prefix_agreement,
      tax_status,
      gstin,
      pan,
      bank_name,
      bank_account_name,
      bank_account_number,
      bank_ifsc,
      bank_branch,
      upi_id,
      notes_and_terms,
    } = req.body;

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ success: false, error: 'Invalid business email format.' });
      }
    }

    if (gstin && gstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(gstin.trim().toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid GSTIN format. Valid format is 15 alphanumeric characters.',
        });
      }
    }

    Object.assign(settings, {
      business_name: business_name || settings.business_name,
      structure: structure || settings.structure,
      proprietor_name: proprietor_name !== undefined ? proprietor_name.trim() : settings.proprietor_name,
      email: email || settings.email,
      phone: phone || settings.phone,
      address: address !== undefined ? address.trim() : settings.address,
      website: website !== undefined ? website.trim() : settings.website,
      logo_url: logo_url !== undefined ? logo_url.trim() : settings.logo_url,
      default_payment_terms: default_payment_terms !== undefined ? default_payment_terms : settings.default_payment_terms,
      default_validity_days: Number(default_validity_days) || settings.default_validity_days,
      prefix_invoice: prefix_invoice || settings.prefix_invoice,
      prefix_quotation: prefix_quotation || settings.prefix_quotation,
      prefix_proposal: prefix_proposal || settings.prefix_proposal,
      prefix_agreement: prefix_agreement || settings.prefix_agreement,
      tax_status: tax_status || settings.tax_status,
      gstin: gstin !== undefined ? gstin.trim().toUpperCase() : settings.gstin,
      pan: pan !== undefined ? pan.trim().toUpperCase() : settings.pan,
      bank_name: bank_name !== undefined ? bank_name.trim() : settings.bank_name,
      bank_account_name: bank_account_name !== undefined ? bank_account_name.trim() : settings.bank_account_name,
      bank_account_number: bank_account_number !== undefined ? bank_account_number.trim() : settings.bank_account_number,
      bank_ifsc: bank_ifsc !== undefined ? bank_ifsc.trim().toUpperCase() : settings.bank_ifsc,
      bank_branch: bank_branch !== undefined ? bank_branch.trim() : settings.bank_branch,
      upi_id: upi_id !== undefined ? upi_id.trim() : settings.upi_id,
      notes_and_terms: notes_and_terms !== undefined ? notes_and_terms : settings.notes_and_terms,
    });

    await settings.save();

    await logActivity({
      req,
      action: 'company_settings_changed',
      recordType: 'CompanySettings',
      recordId: settings._id,
      description: 'Updated StitchX Global Technology company settings and preferences',
    });

    return res.json({ success: true, settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   11. REPORTS & FINANCIAL ANALYTICS
   ========================================================================== */

router.get('/reports/summary', async (req, res) => {
  try {
    const now = new Date();

    // 1. Invoice aging calculation
    const openInvoices = await DocInvoice.find({
      status: { $in: ['issued', 'partially_paid', 'overdue'] },
    });

    let current = 0;
    let days1To30 = 0;
    let days31To60 = 0;
    let days60Plus = 0;

    openInvoices.forEach((inv) => {
      const due = new Date(inv.due_date);
      const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 3600 * 24));
      const bal = inv.outstanding_balance || 0;

      if (diffDays <= 0) {
        current += bal;
      } else if (diffDays <= 30) {
        days1To30 += bal;
      } else if (diffDays <= 60) {
        days31To60 += bal;
      } else {
        days60Plus += bal;
      }
    });

    // 2. Monthly Collection Aggregation
    const monthlyCollections = await DocPayment.aggregate([
      { $match: { verification_status: 'verified' } },
      {
        $group: {
          _id: { $substr: ['$payment_date', 0, 7] }, // YYYY-MM
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 3. Payment Method Distribution
    const methodDistribution = await DocPayment.aggregate([
      { $match: { verification_status: 'verified' } },
      {
        $group: {
          _id: '$payment_method',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.json({
      success: true,
      aging: {
        current: Math.round(current * 100) / 100,
        days1To30: Math.round(days1To30 * 100) / 100,
        days31To60: Math.round(days31To60 * 100) / 100,
        days60Plus: Math.round(days60Plus * 100) / 100,
        totalOutstanding: Math.round((current + days1To30 + days31To60 + days60Plus) * 100) / 100,
      },
      monthlyCollections,
      methodDistribution,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   12. USER & ROLE MANAGEMENT
   ========================================================================== */

router.get('/users', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    const users = await AdminUser.find().select('-password_hash -salt');
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/users', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    const { username, password, role = 'doc_manager' } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    const allowedRoles = ['owner', 'admin', 'accountant', 'doc_manager', 'viewer'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role specified.' });
    }

    // Only owners can create other owner accounts
    if (role === 'owner' && req.userRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only owners can create an owner account.' });
    }

    // Enforce password strength
    if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, error: getPasswordStrengthError() });
    }

    const existing = await AdminUser.findOne({ username: username.trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Username already in use.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');

    const newUser = await AdminUser.create({
      username: username.trim(),
      password_hash: hash,
      salt,
      role,
    });

    await logActivity({
      req,
      action: 'user_created',
      recordType: 'AdminUser',
      recordId: newUser._id,
      description: `Created user ${newUser.username} with role ${role}`,
    });

    return res.status(201).json({
      success: true,
      user: { id: newUser._id, username: newUser.username, role: newUser.role },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/users/:id/role', requireRoles(['owner', 'admin']), async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ['owner', 'admin', 'accountant', 'doc_manager', 'viewer'];
    if (!allowed.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role specified.' });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format.' });
    }

    if (role === 'owner' && req.userRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Only owners can assign the owner role.' });
    }

    const user = await AdminUser.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    // Prevent non-owners from modifying owner accounts
    if (user.role === 'owner' && req.userRole !== 'owner') {
      return res.status(403).json({ success: false, error: 'Cannot modify permissions of an owner account.' });
    }

    user.role = role;
    await user.save();

    await logActivity({
      req,
      action: 'permissions_changed',
      recordType: 'AdminUser',
      recordId: user._id,
      description: `Changed role of ${user.username} to ${role}`,
    });

    return res.json({ success: true, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   13. ACTIVITY LOGS & AUDIT TRAIL
   ========================================================================== */

router.get('/activity-logs', async (req, res) => {
  try {
    const { action, search, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (action && action !== 'all') filter.action = action;
    if (search) {
      filter.$or = [
        { description: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { record_type: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      ActivityLog.find(filter).sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
      ActivityLog.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   14. UNIFIED DOCUMENT SEARCH (ALL DOCUMENTS)
   ========================================================================== */

router.get('/all-documents', async (req, res) => {
  try {
    const { query = '', type = 'all', status = 'all' } = req.query;

    const results = [];

    // Search Quotations
    if (type === 'all' || type === 'quotation') {
      const qFilter = {};
      if (status !== 'all') qFilter.status = status;
      if (query) {
        qFilter.$or = [
          { quotation_number: { $regex: query, $options: 'i' } },
          { title: { $regex: query, $options: 'i' } },
          { 'client_snapshot.name': { $regex: query, $options: 'i' } },
        ];
      }
      const quotes = await DocQuotation.find(qFilter).sort({ created_at: -1 }).limit(15);
      quotes.forEach((q) => {
        results.push({
          id: q._id,
          docType: 'quotation',
          number: q.quotation_number,
          title: q.title,
          client: q.client_snapshot?.name || 'N/A',
          amount: q.grand_total,
          status: q.status,
          date: q.quotation_date,
          created_at: q.created_at,
        });
      });
    }

    // Search Invoices
    if (type === 'all' || type === 'invoice') {
      const iFilter = {};
      if (status !== 'all') iFilter.status = status;
      if (query) {
        iFilter.$or = [
          { invoice_number: { $regex: query, $options: 'i' } },
          { 'client_snapshot.name': { $regex: query, $options: 'i' } },
        ];
      }
      const invoices = await DocInvoice.find(iFilter).sort({ created_at: -1 }).limit(15);
      invoices.forEach((inv) => {
        results.push({
          id: inv._id,
          docType: 'invoice',
          number: inv.invoice_number,
          title: `Invoice (${inv.tax_treatment === 'gst_tax_invoice' ? 'GST' : 'Commercial'})`,
          client: inv.client_snapshot?.name || 'N/A',
          amount: inv.total_amount,
          balance: inv.outstanding_balance,
          status: inv.status,
          date: inv.invoice_date,
          created_at: inv.created_at,
        });
      });
    }

    // Search Proposals
    if (type === 'all' || type === 'proposal') {
      const pFilter = {};
      if (status !== 'all') pFilter.status = status;
      if (query) {
        pFilter.$or = [
          { proposal_number: { $regex: query, $options: 'i' } },
          { project_title: { $regex: query, $options: 'i' } },
          { 'client_snapshot.name': { $regex: query, $options: 'i' } },
        ];
      }
      const proposals = await DocProposal.find(pFilter).sort({ created_at: -1 }).limit(15);
      proposals.forEach((p) => {
        results.push({
          id: p._id,
          docType: 'proposal',
          number: p.proposal_number,
          title: p.project_title,
          client: p.client_snapshot?.name || 'N/A',
          amount: p.total_budget,
          status: p.status,
          date: p.created_at,
          created_at: p.created_at,
        });
      });
    }

    // Search Agreements
    if (type === 'all' || type === 'agreement') {
      const aFilter = {};
      if (status !== 'all') aFilter.status = status;
      if (query) {
        aFilter.$or = [
          { agreement_number: { $regex: query, $options: 'i' } },
          { second_party_name: { $regex: query, $options: 'i' } },
          { purpose: { $regex: query, $options: 'i' } },
        ];
      }
      const agreements = await DocAgreement.find(aFilter).sort({ created_at: -1 }).limit(15);
      agreements.forEach((a) => {
        results.push({
          id: a._id,
          docType: 'agreement',
          number: a.agreement_number,
          title: `${a.agreement_type.toUpperCase().replace('_', ' ')}`,
          client: a.second_party_name || 'N/A',
          amount: 0,
          status: a.status,
          date: a.created_at,
          created_at: a.created_at,
        });
      });
    }

    // Search Stored Files
    if (type === 'all' || type === 'file') {
      const fFilter = { is_archived: false };
      if (query) {
        fFilter.$or = [
          { title: { $regex: query, $options: 'i' } },
          { original_filename: { $regex: query, $options: 'i' } },
        ];
      }
      const files = await StoredDocument.find(fFilter).sort({ created_at: -1 }).limit(15);
      files.forEach((f) => {
        results.push({
          id: f._id,
          docType: 'file',
          number: f.file_id,
          title: f.title,
          client: f.uploaded_by,
          amount: 0,
          status: f.category,
          date: f.created_at,
          created_at: f.created_at,
        });
      });
    }

    // Sort combined results by created_at desc
    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.json({ success: true, documents: results.slice(0, 50) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
