import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  HeadingLevel,
  WidthType,
  BorderStyle,
} from 'docx';

function formatINR(val) {
  const num = Number(val) || 0;
  return 'INR ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
 * Generate Microsoft Word (.docx) for Quotations
 */
export async function generateQuotationDocx(quotation, company = {}) {
  const bizName = company.business_name || 'StitchX Global Technology';
  const bizEmail = company.email || 'info@stitchxglobal.com';
  const bizPhone = company.phone || '9341660370';

  const rows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Description', bold: true, color: '1677FF' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Qty', bold: true, color: '1677FF' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Unit Price', bold: true, color: '1677FF' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Amount', bold: true, color: '1677FF' })],
            }),
          ],
        }),
      ],
    }),
  ];

  (quotation.items || []).forEach((item) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: item.description || '' })],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                text: String(item.quantity || 1),
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                text: formatINR(item.unit_price),
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                text: formatINR(item.amount),
              }),
            ],
          }),
        ],
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: bizName, bold: true, size: 28, color: '0B192C' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `${bizEmail} | +91 ${bizPhone}`, size: 18, color: '596579' }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({ text: 'QUOTATION', bold: true, color: '1677FF', size: 32 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Quotation Number: `, bold: true }),
              new TextRun({ text: quotation.quotation_number || '' }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Date: `, bold: true }),
              new TextRun({ text: formatDate(quotation.quotation_date) }),
              new TextRun({ text: `    Valid Until: `, bold: true }),
              new TextRun({ text: formatDate(quotation.expiry_date) }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Client: `, bold: true }),
              new TextRun({ text: quotation.client_snapshot?.name || quotation.client_id?.name || 'N/A' }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Contact: `, bold: true }),
              new TextRun({ text: quotation.client_snapshot?.contact_person || quotation.client_snapshot?.email || 'N/A' }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Subtotal: `, bold: true }),
              new TextRun({ text: formatINR(quotation.subtotal) }),
            ],
          }),
          quotation.total_discount > 0
            ? new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `Discount: -`, bold: true, color: '16A34A' }),
                  new TextRun({ text: formatINR(quotation.total_discount), color: '16A34A' }),
                ],
              })
            : new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Grand Total: `, bold: true, size: 24, color: '1677FF' }),
              new TextRun({ text: formatINR(quotation.grand_total), bold: true, size: 24, color: '1677FF' }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Terms & Conditions', bold: true, size: 20 })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: quotation.terms_conditions || '1. This quotation is valid for 30 days from date of issuance. 2. Work commences upon signing and initial agreed advance.',
                size: 18,
                color: '596579',
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Generate Microsoft Word (.docx) for Invoices
 */
export async function generateInvoiceDocx(invoice, company = {}) {
  const bizName = company.business_name || 'StitchX Global Technology';
  const bizEmail = company.email || 'info@stitchxglobal.com';
  const bizPhone = company.phone || '9341660370';
  const bankAcc = company.bank_account_number ? `Acc: ${company.bank_account_number} | IFSC: ${company.bank_ifsc || ''}` : '';

  const rows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Item & Service Description', bold: true, color: '1677FF' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Qty', bold: true, color: '1677FF' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Rate', bold: true, color: '1677FF' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Amount', bold: true, color: '1677FF' })],
            }),
          ],
        }),
      ],
    }),
  ];

  (invoice.items || []).forEach((item) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: item.description || '' })],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                text: String(item.quantity || 1),
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                text: formatINR(item.unit_price),
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                text: formatINR(item.amount),
              }),
            ],
          }),
        ],
      })
    );
  });

  const isGst = invoice.tax_treatment === 'gst_tax_invoice';
  const docTitle = isGst ? 'TAX INVOICE' : 'COMMERCIAL INVOICE';

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: bizName, bold: true, size: 28, color: '0B192C' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `${bizEmail} | +91 ${bizPhone}`, size: 18, color: '596579' }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({ text: docTitle, bold: true, color: '1677FF', size: 32 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Invoice Number: `, bold: true }),
              new TextRun({ text: invoice.invoice_number || '' }),
              new TextRun({ text: `    Status: `, bold: true }),
              new TextRun({ text: (invoice.status || 'draft').toUpperCase(), color: '1677FF' }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Invoice Date: `, bold: true }),
              new TextRun({ text: formatDate(invoice.invoice_date) }),
              new TextRun({ text: `    Due Date: `, bold: true }),
              new TextRun({ text: formatDate(invoice.due_date) }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Billed To: `, bold: true }),
              new TextRun({ text: invoice.client_snapshot?.name || 'Client' }),
            ],
          }),
          invoice.client_snapshot?.gstin
            ? new Paragraph({
                children: [
                  new TextRun({ text: `Client GSTIN: `, bold: true }),
                  new TextRun({ text: invoice.client_snapshot.gstin }),
                ],
              })
            : new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Subtotal: `, bold: true }),
              new TextRun({ text: formatINR(invoice.subtotal) }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Total Invoice Value: `, bold: true, size: 22, color: '0B192C' }),
              new TextRun({ text: formatINR(invoice.total_amount), bold: true, size: 22, color: '0B192C' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Amount Paid: `, bold: true, color: '16A34A' }),
              new TextRun({ text: formatINR(invoice.amount_paid), color: '16A34A' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Balance Due: `, bold: true, size: 24, color: 'DC2626' }),
              new TextRun({ text: formatINR(invoice.outstanding_balance), bold: true, size: 24, color: 'DC2626' }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: 'Payment Information & Instructions', bold: true, size: 20 })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: invoice.payment_instructions || bankAcc || 'Please execute payment via NEFT/IMPS/UPI as indicated.',
                size: 18,
                color: '596579',
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Generate Microsoft Word (.docx) for Proposals
 */
export async function generateProposalDocx(proposal, company = {}) {
  const bizName = company.business_name || 'StitchX Global Technology';

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: bizName, bold: true, size: 28, color: '0B192C' })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: proposal.project_title || 'Project Proposal', bold: true, size: 34, color: '1677FF' })],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Proposal Reference: `, bold: true }),
              new TextRun({ text: proposal.proposal_number || '' }),
              new TextRun({ text: `    Date: `, bold: true }),
              new TextRun({ text: formatDate(proposal.created_at || new Date()) }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Client Organization: `, bold: true }),
              new TextRun({ text: proposal.client_snapshot?.name || 'Client' }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '1. Executive Summary', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: proposal.executive_summary || 'N/A', size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '2. Client Requirements & Context', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: proposal.client_requirements || 'N/A', size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '3. Proposed Solution Architecture', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: proposal.proposed_solution || 'N/A', size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '4. Deliverables & Milestones', bold: true, size: 22 })],
          }),
          ...(proposal.deliverables || []).map(
            (deliv) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: deliv, size: 19 })],
              })
          ),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '5. Investment & Commercial Terms', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Total Contract Investment: `, bold: true }),
              new TextRun({ text: formatINR(proposal.total_budget), bold: true, color: '1677FF' }),
            ],
          }),
          new Paragraph({
            children: [new TextRun({ text: proposal.fees_and_payment_schedule || 'Milestone-based progress disbursements.', size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '6. Intellectual Property & Support Terms', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: proposal.ip_terms || 'Deliverable IP transfers upon final settlement.', size: 18, color: '596579' })],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Generate Microsoft Word (.docx) for NDAs and Agreements
 */
export async function generateAgreementDocx(agreement, company = {}) {
  const bizName = company.business_name || 'StitchX Global Technology';

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: agreement.agreement_type === 'mutual_nda' ? 'MUTUAL NON-DISCLOSURE AGREEMENT' : 'NON-DISCLOSURE AGREEMENT',
                bold: true,
                size: 28,
                color: '1677FF',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `Document Number: ${agreement.agreement_number}`, bold: true, size: 18 }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: `This Confidentiality Agreement is entered into between ${agreement.first_party_name || bizName} ("First Party") and ${agreement.second_party_name} ("Second Party").`,
                size: 20,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '1. Purpose', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: agreement.purpose || '', size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '2. Definition of Confidential Information', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: agreement.confidential_info_definition || '', size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '3. Exclusions from Confidential Treatment', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: agreement.exclusions || '', size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '4. Non-Disclosure Obligations', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: agreement.confidentiality_obligations || '', size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: '5. Term and Governing Law', bold: true, size: 22 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `${agreement.term_and_survival || ''} ${agreement.governing_law || ''}`, size: 19 })],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'DISCLAIMER: ' + (agreement.legal_disclaimer || 'Standard digital agency commercial confidentiality template. Consult legal counsel for specialized multi-jurisdictional contracts.'),
                italics: true,
                size: 16,
                color: '64748B',
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
