import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Locate a headless-capable Chromium / Edge executable on the host system.
 */
function findBrowserExecutable() {
  const customBin = process.env.CHROME_BIN || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (customBin && fs.existsSync(customBin)) return customBin;

  const candidatePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function formatINR(val) {
  const num = Number(val) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Base A4 Print Styling CSS for pixel-perfect PDF rendering.
 * Enforces standard A4 portrait dimensions (210mm x 297mm) and 12mm 14mm margins.
 */
const BASE_PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 12mm 14mm 12mm 14mm;
  }
  *, *::before, *::after {
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    background: #FFFFFF !important;
    color: #0F172A !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
    font-size: 10.5px !important;
    line-height: 1.4 !important;
  }
  .doc-sheet {
    width: 182mm !important;
    max-width: 182mm !important;
    margin: 0 auto !important;
    padding: 0 !important;
    background: #FFFFFF !important;
  }
  /* Typography */
  h1, h2, h3, h4 {
    margin: 0 !important;
    color: #0F172A !important;
    page-break-after: avoid !important;
    break-after: avoid !important;
  }
  p {
    margin: 0 0 4px 0 !important;
  }
  /* Tables */
  table {
    width: 100% !important;
    max-width: 182mm !important;
    border-collapse: collapse !important;
    table-layout: fixed !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
    margin-bottom: 8px !important;
  }
  thead {
    display: table-header-group !important;
  }
  tbody {
    display: table-row-group !important;
  }
  tfoot {
    display: table-footer-group !important;
  }
  tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  th {
    background-color: #F1F5F9 !important;
    color: #1E293B !important;
    font-size: 9.5px !important;
    font-weight: 800 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    padding: 6px 8px !important;
    border: 1px solid #CBD5E1 !important;
  }
  td {
    padding: 6px 8px !important;
    border: 1px solid #E2E8F0 !important;
    font-size: 10px !important;
    word-break: break-word !important;
    overflow-wrap: break-word !important;
    vertical-align: top !important;
  }
  /* Borders and utilities */
  .border-box {
    border: 1px solid #E2E8F0 !important;
    border-radius: 6px !important;
    padding: 8px 10px !important;
    background: #F8FAFC !important;
  }
  .flex-row {
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: flex-start !important;
  }
  .avoid-break {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  .text-right { text-align: right !important; }
  .text-center { text-align: center !important; }
  .text-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
  .font-bold { font-weight: 700 !important; }
  .font-black { font-weight: 900 !important; }
  .text-brand { color: #1677FF !important; }
  .badge {
    display: inline-block !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    font-size: 8.5px !important;
    font-weight: 800 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
  }
  .badge-blue { background: #EFF6FF !important; color: #1677FF !important; border: 1px solid #BFDBFE !important; }
  .badge-green { background: #ECFDF5 !important; color: #059669 !important; border: 1px solid #A7F3D0 !important; }
  .badge-purple { background: #FAF5FF !important; color: #7E22CE !important; border: 1px solid #E9D5FF !important; }
  .divider {
    width: 100% !important;
    height: 2px !important;
    background: linear-gradient(90deg, #1677FF, #38BDF8, #E2E8F0) !important;
    margin: 8px 0 10px 0 !important;
  }
  .footer-bar {
    margin-top: 12px !important;
    padding-top: 6px !important;
    border-top: 1px solid #CBD5E1 !important;
    font-size: 8.5px !important;
    color: #64748B !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
  }
`;

/**
 * Standard StitchX Header Block
 */
function renderHeader(company, docTitle, docNumber, docDate, validUntil, status) {
  const bizName = company.business_name || 'StitchX Global Technology';
  const bizAddress = company.address || 'Sector 9A, Gurugram, Haryana, India';
  const bizEmail = company.email || 'info@stitchxglobal.com';
  const bizPhone = company.phone || '9341660370';
  const bizWebsite = company.website || 'https://stitchxglobal.com';

  return `
    <div class="flex-row" style="align-items: center; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px;">
      <div>
        <div style="font-size: 18px; font-weight: 900; color: #0F172A; letter-spacing: -0.02em;">
          <span style="color: #1677FF;">StitchX</span> Global Technology
        </div>
        <div style="font-size: 9px; color: #64748B; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 1px;">
          Enterprise Software Engineering & Digital Solutions
        </div>
      </div>
      <div class="text-right" style="font-size: 9.5px; color: #475569; line-height: 1.35;">
        <div style="font-weight: 700; color: #0F172A;">${bizAddress}</div>
        <div>Email: <strong style="color: #0F172A;">${bizEmail}</strong> | Phone: <strong style="color: #0F172A;">+91 ${bizPhone}</strong></div>
        <div>Web: <strong style="color: #0F172A;">${bizWebsite}</strong></div>
      </div>
    </div>
    <div class="divider"></div>

    <div class="border-box flex-row" style="margin-bottom: 10px; align-items: center;">
      <div>
        <span class="badge badge-blue">${docTitle}</span>
        <span style="font-size: 9px; color: #64748B; font-weight: 700; margin-left: 6px;">FY 2026-27</span>
        <div class="text-mono font-black" style="font-size: 13px; color: #0F172A; margin-top: 2px;">
          ${docNumber}
        </div>
      </div>
      <div class="text-right flex-row" style="gap: 16px;">
        <div>
          <div style="font-size: 8px; text-transform: uppercase; color: #64748B; font-weight: 700;">Issue Date</div>
          <div style="font-size: 10px; font-weight: 700; color: #0F172A;">${formatDate(docDate)}</div>
        </div>
        ${validUntil ? `
        <div style="border-left: 1px solid #CBD5E1; padding-left: 14px;">
          <div style="font-size: 8px; text-transform: uppercase; color: #64748B; font-weight: 700;">Valid Until / Due</div>
          <div style="font-size: 10px; font-weight: 700; color: #B91C1C;">${formatDate(validUntil)}</div>
        </div>` : ''}
        <div style="border-left: 1px solid #CBD5E1; padding-left: 14px;">
          <div style="font-size: 8px; text-transform: uppercase; color: #64748B; font-weight: 700;">Status</div>
          <span class="badge badge-green">${(status || 'active').toUpperCase()}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Standard Client Snapshot Block
 */
function renderClientBox(client, projectTitle, extraRight = '') {
  return `
    <div class="border-box flex-row" style="background: #FFFFFF; margin-bottom: 10px;">
      <div style="flex: 1; padding-right: 12px;">
        <div style="font-size: 8.5px; font-weight: 800; color: #1677FF; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">
          PREPARED FOR / CLIENT:
        </div>
        <div style="font-size: 12px; font-weight: 800; color: #0F172A;">
          ${client?.name || 'Client Enterprise Representative'}
        </div>
        ${client?.contact_person ? `<div style="font-size: 9.5px; font-weight: 700; color: #334155;">Attn: ${client.contact_person}</div>` : ''}
        ${client?.email ? `<div style="font-size: 9px; color: #64748B;">${client.email}</div>` : ''}
        ${client?.phone ? `<div style="font-size: 9px; color: #64748B;">+91 ${client.phone}</div>` : ''}
        ${client?.billing_address ? `<div style="font-size: 9px; color: #64748B; margin-top: 2px;">${client.billing_address}</div>` : ''}
        ${client?.gstin ? `<div class="text-mono font-bold" style="font-size: 9px; color: #0F172A; margin-top: 2px;">GSTIN: ${client.gstin}</div>` : ''}
      </div>
      <div class="text-right" style="flex: 1; border-left: 1px solid #E2E8F0; padding-left: 12px;">
        <div style="font-size: 8.5px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">
          ENGAGEMENT SCOPE:
        </div>
        <div style="font-size: 10.5px; font-weight: 700; color: #1E293B;">
          ${projectTitle || 'Enterprise Software Engineering & Digital Architecture'}
        </div>
        <div style="font-size: 9px; color: #64748B; margin-top: 3px;">
          Currency: <strong style="color: #0F172A;">INR (₹)</strong>
        </div>
        ${extraRight}
      </div>
    </div>
  `;
}

/**
 * Standard Signatures & Footer Block
 */
function renderSignatures(company, clientName, docNumber, docDate) {
  const bizName = company.business_name || 'StitchX Global Technology';
  const bizAddress = company.address || 'Sector 9A, Gurugram, Haryana';
  const bizEmail = company.email || 'info@stitchxglobal.com';
  const bizPhone = company.phone || '9341660370';

  return `
    <div class="avoid-break" style="margin-top: 12px; border-top: 2px solid #CBD5E1; padding-top: 8px;">
      <div class="flex-row" style="align-items: flex-end;">
        <div>
          <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #1E293B;">For ${bizName}</div>
          <div class="badge badge-blue" style="margin: 4px 0;">✓ Digitally Auto-Signed</div>
          <div style="font-size: 8.5px; color: #64748B;">This is a computer-generated document. No manual signature required.</div>
          <div class="text-mono" style="font-size: 8px; color: #94A3B8; margin-top: 2px;">Ref: ${docNumber} • ${formatDate(docDate)}</div>
        </div>
        <div class="text-right" style="width: 200px; border-top: 1px dashed #94A3B8; padding-top: 4px;">
          <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #1E293B;">Client Acceptance & Seal</div>
          <div style="font-size: 9px; font-weight: 700; color: #475569; margin-top: 2px;">${clientName || 'Authorized Signatory'}</div>
          <div style="height: 24px;"></div>
          <div style="font-size: 8.5px; color: #64748B;">Date: ________________________</div>
        </div>
      </div>
      <div class="footer-bar">
        <div><strong>StitchX Global Technology</strong> • Software Engineering & Cloud Solutions</div>
        <div>${bizAddress} • ${bizEmail} • +91 ${bizPhone}</div>
      </div>
    </div>
  `;
}

/**
 * HTML Template for Quotations
 */
export function buildQuotationHtml(quotation, company = {}) {
  const docTitle = 'PROJECT QUOTATION';
  const docNumber = (quotation.quotation_number || 'SX-Q-2026').replace(/^SX\/Q\//i, 'Q-').replace(/^SX\/Q-/i, 'Q-');
  const docDate = quotation.quotation_date || quotation.created_at;
  const client = quotation.client_snapshot || quotation.client_id || {};
  const grandTotal = Number(quotation.grand_total || quotation.total_amount || 0);

  const itemsHtml = (quotation.items || []).map((item, idx) => `
    <tr>
      <td class="text-center text-mono font-bold" style="width: 32px;">${idx + 1}</td>
      <td>
        <div class="font-bold" style="color: #0F172A;">${item.description || ''}</div>
      </td>
      <td class="text-center font-bold" style="width: 45px;">${item.quantity || 1}</td>
      <td class="text-right text-mono font-bold" style="width: 95px;">${formatINR(item.unit_price)}</td>
      <td class="text-right text-mono font-black" style="width: 105px;">${formatINR(item.amount)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${docNumber} - ${docTitle}</title>
      <style>${BASE_PRINT_CSS}</style>
    </head>
    <body>
      <div class="doc-sheet">
        ${renderHeader(company, docTitle, docNumber, docDate, quotation.expiry_date, quotation.status)}
        ${renderClientBox(client, quotation.title || quotation.project_title)}

        <!-- Pricing Table -->
        <table>
          <thead>
            <tr>
              <th style="width: 32px;" class="text-center">#</th>
              <th>Service Description / Deliverables</th>
              <th style="width: 45px;" class="text-center">Qty</th>
              <th style="width: 95px;" class="text-right">Unit Price</th>
              <th style="width: 105px;" class="text-right">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Summary & Acceptance area -->
        <div class="flex-row avoid-break" style="margin-bottom: 8px;">
          <div style="flex: 1; padding-right: 16px;">
            <div style="font-size: 8.5px; font-weight: 800; color: #1E293B; text-transform: uppercase; margin-bottom: 3px;">
              Quotation Validity & Acceptance:
            </div>
            <div class="border-box" style="font-size: 9.5px; line-height: 1.4;">
              <div>Valid Until: <strong class="text-brand text-mono">${formatDate(quotation.expiry_date)}</strong></div>
              <div style="color: #475569; margin-top: 3px;">
                Engineering initiates upon mutual endorsement and initial milestone disbursement.
              </div>
            </div>
          </div>
          <div style="width: 220px;" class="text-right">
            <div class="flex-row" style="padding: 2px 0; font-size: 9.5px; color: #475569;">
              <span>Subtotal:</span>
              <span class="text-mono font-bold" style="color: #0F172A;">${formatINR(quotation.subtotal)}</span>
            </div>
            ${quotation.total_discount > 0 ? `
            <div class="flex-row" style="padding: 2px 0; font-size: 9.5px; color: #059669;">
              <span>Discount:</span>
              <span class="text-mono font-bold">-${formatINR(quotation.total_discount)}</span>
            </div>` : ''}
            ${quotation.tax_amount > 0 ? `
            <div class="flex-row" style="padding: 2px 0; font-size: 9.5px; color: #475569;">
              <span>Tax (GST):</span>
              <span class="text-mono font-bold">${formatINR(quotation.tax_amount)}</span>
            </div>` : ''}
            <div class="border-box flex-row" style="background: #EFF6FF; border: 1.5px solid #93C5FD; margin-top: 4px; padding: 6px 8px;">
              <span style="font-weight: 900; font-size: 10px; color: #1E293B; text-transform: uppercase;">Grand Total:</span>
              <span class="text-mono text-brand font-black" style="font-size: 13px;">${formatINR(grandTotal)}</span>
            </div>
          </div>
        </div>

        <!-- Structured Milestone Schedule -->
        <div class="avoid-break" style="margin-top: 6px;">
          <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #1E293B; margin-bottom: 4px;">
            Structured Milestone Payment Schedule
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 48px;" class="text-center">Stage</th>
                <th>Deliverable Description</th>
                <th style="width: 55px;" class="text-center">Share</th>
                <th style="width: 95px;" class="text-right">Amount</th>
                <th style="width: 115px;" class="text-center">Release Condition</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-center text-mono font-bold">M1</td>
                <td><strong>Project Mobilization & Architecture Approval</strong></td>
                <td class="text-center text-mono font-bold">30%</td>
                <td class="text-right text-mono font-black">${formatINR(grandTotal * 0.3)}</td>
                <td class="text-center" style="font-size: 9px; font-weight: 700; color: #1677FF;">Contract Execution</td>
              </tr>
              <tr>
                <td class="text-center text-mono font-bold">M2</td>
                <td><strong>Beta Delivery & Core Functional Platform</strong></td>
                <td class="text-center text-mono font-bold">40%</td>
                <td class="text-right text-mono font-black">${formatINR(grandTotal * 0.4)}</td>
                <td class="text-center" style="font-size: 9px; font-weight: 700; color: #059669;">UAT Demonstration</td>
              </tr>
              <tr>
                <td class="text-center text-mono font-bold">M3</td>
                <td><strong>Production Handover, Cloud Launch & Sign-off</strong></td>
                <td class="text-center text-mono font-bold">30%</td>
                <td class="text-right text-mono font-black">${formatINR(grandTotal * 0.3)}</td>
                <td class="text-center" style="font-size: 9px; font-weight: 700; color: #1E293B;">Final Handover</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${renderSignatures(company, client?.name, docNumber, docDate)}
      </div>
    </body>
    </html>
  `;
}

/**
 * HTML Template for Invoices
 */
export function buildInvoiceHtml(invoice, company = {}) {
  const isGst = invoice.tax_treatment === 'gst_tax_invoice';
  const docTitle = isGst ? 'TAX INVOICE' : 'COMMERCIAL INVOICE';
  const docNumber = invoice.invoice_number || 'SX-INV-2026';
  const docDate = invoice.invoice_date || invoice.created_at;
  const client = invoice.client_snapshot || invoice.client_id || {};
  const totalAmount = Number(invoice.total_amount || invoice.grand_total || 0);
  const amountPaid = Number(invoice.amount_paid || 0);
  const outstanding = Number(invoice.outstanding_balance ?? (totalAmount - amountPaid));

  const itemsHtml = (invoice.items || []).map((item, idx) => `
    <tr>
      <td class="text-center text-mono font-bold" style="width: 32px;">${idx + 1}</td>
      <td><div class="font-bold" style="color: #0F172A;">${item.description || ''}</div></td>
      <td class="text-center font-bold" style="width: 45px;">${item.quantity || 1}</td>
      <td class="text-right text-mono font-bold" style="width: 95px;">${formatINR(item.unit_price)}</td>
      <td class="text-right text-mono font-black" style="width: 105px;">${formatINR(item.amount)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${docNumber} - ${docTitle}</title>
      <style>${BASE_PRINT_CSS}</style>
    </head>
    <body>
      <div class="doc-sheet">
        ${renderHeader(company, docTitle, docNumber, docDate, invoice.due_date, invoice.status)}
        ${renderClientBox(client, invoice.title || 'Enterprise Engineering Sprints', `
          <div style="margin-top: 4px; font-size: 9px; color: #64748B;">
            Tax Category: <strong style="color: #0F172A;">${isGst ? 'GST Registered' : 'Commercial Non-GST'}</strong>
          </div>
        `)}

        <table>
          <thead>
            <tr>
              <th style="width: 32px;" class="text-center">#</th>
              <th>Item & Service Description</th>
              <th style="width: 45px;" class="text-center">Qty</th>
              <th style="width: 95px;" class="text-right">Unit Rate</th>
              <th style="width: 105px;" class="text-right">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Summary & Banking area -->
        <div class="flex-row avoid-break" style="margin-bottom: 8px;">
          <div style="flex: 1; padding-right: 16px;">
            <div style="font-size: 8.5px; font-weight: 800; color: #1E293B; text-transform: uppercase; margin-bottom: 3px;">
              Bank Settlement Details:
            </div>
            <div class="border-box text-mono" style="font-size: 9px; line-height: 1.45; color: #1E293B;">
              <div>Bank Name: <strong>${company.bank_name || 'HDFC Bank Ltd.'}</strong></div>
              <div>Account No: <strong>${company.bank_account_number || '50200088991122'}</strong></div>
              <div>IFSC Code: <strong>${company.bank_ifsc || 'HDFC0001234'}</strong></div>
              <div>UPI ID: <strong>${company.upi_id || 'stitchx@hdfcbank'}</strong></div>
            </div>
          </div>
          <div style="width: 220px;" class="text-right">
            <div class="flex-row" style="padding: 2px 0; font-size: 9.5px; color: #475569;">
              <span>Subtotal:</span>
              <span class="text-mono font-bold" style="color: #0F172A;">${formatINR(invoice.subtotal)}</span>
            </div>
            ${invoice.tax_amount > 0 ? `
            <div class="flex-row" style="padding: 2px 0; font-size: 9.5px; color: #475569;">
              <span>GST Tax:</span>
              <span class="text-mono font-bold">${formatINR(invoice.tax_amount)}</span>
            </div>` : ''}
            <div class="border-box flex-row" style="background: #EFF6FF; border: 1.5px solid #93C5FD; margin-top: 4px; padding: 6px 8px;">
              <span style="font-weight: 900; font-size: 10px; color: #1E293B; text-transform: uppercase;">Total Invoice Value:</span>
              <span class="text-mono text-brand font-black" style="font-size: 13px;">${formatINR(totalAmount)}</span>
            </div>
            <div class="flex-row" style="padding: 3px 0; font-size: 9.5px; color: #059669; font-weight: 700;">
              <span>Amount Paid:</span>
              <span class="text-mono">${formatINR(amountPaid)}</span>
            </div>
            <div class="flex-row" style="padding: 3px 0; font-size: 10px; color: #B91C1C; font-weight: 900; border-top: 1px solid #E2E8F0;">
              <span>Balance Outstanding:</span>
              <span class="text-mono" style="font-size: 11px;">${formatINR(outstanding)}</span>
            </div>
          </div>
        </div>

        ${renderSignatures(company, client?.name, docNumber, docDate)}
      </div>
    </body>
    </html>
  `;
}

/**
 * HTML Template for Proposals
 */
export function buildProposalHtml(proposal, company = {}) {
  const docTitle = 'PROJECT PROPOSAL';
  const docNumber = (proposal.proposal_number || 'SX-P-2026').replace(/^SX\/P\//i, 'P-').replace(/^SX\/P-/i, 'P-');
  const docDate = proposal.created_at || new Date();
  const client = proposal.client_snapshot || proposal.client_id || {};
  const totalBudget = Number(proposal.total_budget || 0);

  const deliverablesHtml = (proposal.deliverables || []).map(d => `<li style="margin-bottom: 3px;">${d}</li>`).join('');
  const techStackHtml = (proposal.tech_stack || []).map(t => `<span class="badge" style="background: #F1F5F9; border: 1px solid #CBD5E1; color: #334155; margin: 2px;">${t}</span>`).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${docNumber} - ${docTitle}</title>
      <style>${BASE_PRINT_CSS}</style>
    </head>
    <body>
      <div class="doc-sheet">
        ${renderHeader(company, docTitle, docNumber, docDate, null, proposal.status)}
        ${renderClientBox(client, proposal.project_title || 'Enterprise Engineering Architecture')}

        <!-- Executive Summary -->
        <div style="margin-bottom: 8px;">
          <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1677FF; margin-bottom: 3px;">
            1. Executive Summary & Objective
          </h3>
          <div class="border-box" style="font-size: 9.5px; line-height: 1.45; color: #334155;">
            ${proposal.executive_summary || 'StitchX Global Technology is pleased to present this technical architecture proposal for turnkey digital platform engineering, scalable cloud infrastructure, and enterprise workflows.'}
          </div>
        </div>

        ${proposal.client_requirements ? `
        <div style="margin-bottom: 8px;">
          <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1E293B; margin-bottom: 3px;">
            2. Client Requirements & Challenges
          </h3>
          <div style="font-size: 9.5px; line-height: 1.45; color: #475569; padding-left: 2px;">
            ${proposal.client_requirements}
          </div>
        </div>` : ''}

        ${proposal.proposed_solution ? `
        <div style="margin-bottom: 8px;">
          <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1E293B; margin-bottom: 3px;">
            3. Proposed Architectural Solution
          </h3>
          <div style="font-size: 9.5px; line-height: 1.45; color: #475569; padding-left: 2px;">
            ${proposal.proposed_solution}
          </div>
        </div>` : ''}

        ${deliverablesHtml ? `
        <div style="margin-bottom: 8px;">
          <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1E293B; margin-bottom: 3px;">
            4. Key Deliverables
          </h3>
          <ul style="margin: 0; padding-left: 18px; font-size: 9.5px; color: #334155;">
            ${deliverablesHtml}
          </ul>
        </div>` : ''}

        ${techStackHtml ? `
        <div style="margin-bottom: 8px;">
          <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1E293B; margin-bottom: 3px;">
            5. Recommended Technology Stack
          </h3>
          <div>${techStackHtml}</div>
        </div>` : ''}

        <!-- Proposal Commercial Milestone Schedule -->
        <div class="avoid-break" style="margin-top: 6px;">
          <div class="flex-row" style="align-items: center; margin-bottom: 4px;">
            <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1E293B;">
              6. Structured Milestone Payment Schedule
            </h3>
            <span class="text-mono" style="font-size: 10px; font-weight: 800; color: #1677FF;">
              Total Value: ${formatINR(totalBudget)}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 48px;" class="text-center">Stage</th>
                <th>Milestone Deliverable / Description</th>
                <th style="width: 55px;" class="text-center">Share</th>
                <th style="width: 95px;" class="text-right">Amount (INR)</th>
                <th style="width: 115px;" class="text-center">Release Condition</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-center text-mono font-bold">M1</td>
                <td><strong>Project Kickoff & Architecture Approval</strong></td>
                <td class="text-center text-mono font-bold">30%</td>
                <td class="text-right text-mono font-black">${formatINR(totalBudget * 0.3)}</td>
                <td class="text-center" style="font-size: 9px; font-weight: 700; color: #1677FF;">Contract Signing</td>
              </tr>
              <tr>
                <td class="text-center text-mono font-bold">M2</td>
                <td><strong>Beta Delivery & Core Functional Platform</strong></td>
                <td class="text-center text-mono font-bold">40%</td>
                <td class="text-right text-mono font-black">${formatINR(totalBudget * 0.4)}</td>
                <td class="text-center" style="font-size: 9px; font-weight: 700; color: #059669;">UAT Sign-off</td>
              </tr>
              <tr>
                <td class="text-center text-mono font-bold">M3</td>
                <td><strong>Production Launch & Cloud Handover</strong></td>
                <td class="text-center text-mono font-bold">30%</td>
                <td class="text-right text-mono font-black">${formatINR(totalBudget * 0.3)}</td>
                <td class="text-center" style="font-size: 9px; font-weight: 700; color: #1E293B;">Final Sign-off</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${renderSignatures(company, client?.name, docNumber, docDate)}
      </div>
    </body>
    </html>
  `;
}

/**
 * HTML Template for Agreements & NDAs
 */
export function buildAgreementHtml(agreement, company = {}) {
  const typeMap = {
    msa: 'MASTER SERVICES AGREEMENT',
    service_contract: 'SOFTWARE SERVICE CONTRACT',
    oneway_nda: 'NON-DISCLOSURE AGREEMENT',
    mutual_nda: 'MUTUAL NON-DISCLOSURE AGREEMENT',
  };
  const docTitle = typeMap[agreement.agreement_type] || 'COMMERCIAL AGREEMENT';
  const docNumber = agreement.agreement_number || 'SX-AGR-2026';
  const docDate = agreement.effective_date || agreement.created_at || new Date();
  const bizName = company.business_name || 'StitchX Global Technology';
  const bizAddress = company.address || 'Sector 9A, Gurugram, Haryana';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${docNumber} - ${docTitle}</title>
      <style>${BASE_PRINT_CSS}</style>
    </head>
    <body>
      <div class="doc-sheet">
        ${renderHeader(company, docTitle, docNumber, docDate, null, agreement.status)}

        <!-- Recital Block -->
        <div class="border-box" style="margin-bottom: 10px;">
          <div style="font-size: 9.5px; font-weight: 800; color: #0F172A; margin-bottom: 6px;">
            This Legal Agreement is entered into by and between:
          </div>
          <div class="flex-row">
            <div style="flex: 1; padding-right: 12px;">
              <span class="badge badge-blue">First Party (Service Provider)</span>
              <div style="font-size: 11px; font-weight: 800; color: #0F172A; margin-top: 3px;">${bizName}</div>
              <div style="font-size: 9px; color: #475569;">${bizAddress}</div>
            </div>
            <div style="flex: 1; border-left: 1px solid #E2E8F0; padding-left: 12px;">
              <span class="badge badge-purple">Second Party (Client / Recipient)</span>
              <div style="font-size: 11px; font-weight: 800; color: #0F172A; margin-top: 3px;">${agreement.second_party_name || 'Client Enterprise'}</div>
              <div style="font-size: 9px; color: #475569;">${agreement.second_party_address || 'Address on file'}</div>
              ${agreement.second_party_signatory ? `<div style="font-size: 9px; font-weight: 700; color: #334155;">Signatory: ${agreement.second_party_signatory}</div>` : ''}
            </div>
          </div>
        </div>

        <!-- Purpose -->
        <div style="margin-bottom: 8px;">
          <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1677FF; margin-bottom: 3px;">
            1. Purpose & Recitals
          </h3>
          <div style="font-size: 9.5px; line-height: 1.45; color: #334155;">
            ${agreement.purpose || 'Evaluation, engagement, and execution of professional digital engineering, technical consulting, and cloud application development.'}
          </div>
        </div>

        <!-- Commercial Terms Table -->
        <div class="avoid-break" style="margin-bottom: 8px;">
          <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1E293B; margin-bottom: 4px;">
            2. Commercial Consideration & Milestone Release Triggers
          </h3>
          <table>
            <thead>
              <tr>
                <th style="width: 48px;" class="text-center">Stage</th>
                <th>Milestone Deliverable / Description</th>
                <th style="width: 65px;" class="text-center">Share</th>
                <th style="width: 110px;" class="text-center">Release Trigger</th>
                <th style="width: 95px;" class="text-center">Settlement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-center text-mono font-bold">M1</td>
                <td><strong>Contract Execution & Mobilization</strong></td>
                <td class="text-center text-mono font-bold">30% Advance</td>
                <td class="text-center font-bold" style="color: #1677FF; font-size: 9px;">Contract Signing</td>
                <td class="text-center text-mono" style="font-size: 9px;">Within 7 Days</td>
              </tr>
              <tr>
                <td class="text-center text-mono font-bold">M2</td>
                <td><strong>Beta Delivery & Staging Demo</strong></td>
                <td class="text-center text-mono font-bold">40% Interim</td>
                <td class="text-center font-bold" style="color: #059669; font-size: 9px;">UAT Demonstration</td>
                <td class="text-center text-mono" style="font-size: 9px;">Within 7 Days</td>
              </tr>
              <tr>
                <td class="text-center text-mono font-bold">M3</td>
                <td><strong>Final Handover & Cloud Launch</strong></td>
                <td class="text-center text-mono font-bold">30% Final</td>
                <td class="text-center font-bold" style="color: #1E293B; font-size: 9px;">Final Acceptance</td>
                <td class="text-center text-mono" style="font-size: 9px;">Prior to Handover</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Covenants & Clauses -->
        <div class="avoid-break" style="margin-bottom: 8px;">
          <h3 style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #1E293B; margin-bottom: 4px;">
            3. Standard Covenants & Governance
          </h3>
          <div class="border-box" style="font-size: 9px; line-height: 1.4; color: #334155;">
            <p><strong>• Intellectual Property:</strong> ${agreement.ip_terms || 'Upon 100% full financial settlement of contracted fees, bespoke deliverables and codebase transfer exclusively to the Client. Pre-existing frameworks remain StitchX IP.'}</p>
            <p><strong>• Confidentiality:</strong> Both parties mutually agree to treat all exchanged technical data, architectures, and commercial terms with strict non-disclosure for 3 years.</p>
            <p><strong>• Non-Solicitation:</strong> Neither party shall hire employees or contractors of the other party for eighteen (18) months following contract termination.</p>
            <p><strong>• Governing Jurisdiction:</strong> Subject exclusively to the jurisdiction of the competent courts in Gurugram, Haryana, India.</p>
          </div>
        </div>

        ${renderSignatures(company, agreement.second_party_name, docNumber, docDate)}
      </div>
    </body>
    </html>
  `;
}

/**
 * Core PDF Generation Engine:
 * Converts HTML string to a standard A4 portrait PDF buffer via Headless Chromium / Edge.
 */
export async function convertHtmlToPdfBuffer(htmlString) {
  const browserBin = findBrowserExecutable();
  if (!browserBin) {
    throw new Error('Chromium/Edge browser executable not found on the system for PDF generation.');
  }

  const tempId = crypto.randomBytes(8).toString('hex');
  const tempDir = os.tmpdir();
  const htmlPath = path.join(tempDir, `stitchx_${tempId}.html`);
  const pdfPath = path.join(tempDir, `stitchx_${tempId}.pdf`);

  try {
    fs.writeFileSync(htmlPath, htmlString, 'utf8');

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--run-all-compositor-stages-before-draw',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      htmlPath,
    ];

    await execFileAsync(browserBin, args, { timeout: 30000 });

    if (!fs.existsSync(pdfPath)) {
      throw new Error('Headless browser failed to generate PDF output file.');
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    return pdfBuffer;
  } finally {
    try { if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath); } catch {}
    try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch {}
  }
}

/**
 * Generate PDF Buffer for Quotations
 */
export async function generateQuotationPdf(quotation, company = {}) {
  const html = buildQuotationHtml(quotation, company);
  return await convertHtmlToPdfBuffer(html);
}

/**
 * Generate PDF Buffer for Invoices
 */
export async function generateInvoicePdf(invoice, company = {}) {
  const html = buildInvoiceHtml(invoice, company);
  return await convertHtmlToPdfBuffer(html);
}

/**
 * Generate PDF Buffer for Proposals
 */
export async function generateProposalPdf(proposal, company = {}) {
  const html = buildProposalHtml(proposal, company);
  return await convertHtmlToPdfBuffer(html);
}

/**
 * Generate PDF Buffer for Agreements & NDAs
 */
export async function generateAgreementPdf(agreement, company = {}) {
  const html = buildAgreementHtml(agreement, company);
  return await convertHtmlToPdfBuffer(html);
}
