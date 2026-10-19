import { DocumentCounter, CompanySettings } from '../models/index.js';

/**
 * Returns India Financial Year string (e.g. '2026-27') for a given date.
 * Fiscal year in India starts on April 1 and ends on March 31.
 */
export function getIndiaFinancialYear(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed: 0 = Jan, 3 = April

  if (month >= 3) {
    // April 1 to Dec 31
    const nextYearShort = String(year + 1).slice(-2);
    return `${year}-${nextYearShort}`;
  } else {
    // Jan 1 to March 31
    const currentYearShort = String(year).slice(-2);
    return `${year - 1}-${currentYearShort}`;
  }
}

/**
 * Concurrency-safe atomic document number generator using MongoDB atomic counters.
 * Guarantees unique, sequentially ordered document numbers under concurrent load.
 *
 * @param {'invoice'|'quotation'|'proposal'|'agreement'|'client'|'payment'} type
 * @param {Date} [date]
 * @returns {Promise<string>} e.g. "SX/2026-27/001", "SX/Q/2026-27/001"
 */
export async function generateDocumentNumber(type, date = new Date()) {
  const financialYear = getIndiaFinancialYear(date);

  // Fetch configured prefix and start sequence from CompanySettings (default 1001)
  const settings = await CompanySettings.findOne();
  const startSequence = settings?.start_sequence || 1001;

  // Atomic increment with upsert guarantees no duplicate sequence IDs
  const counter = await DocumentCounter.findOneAndUpdate(
    { type, financial_year: financialYear },
    { $inc: { sequence: 1 } },
    {
      returnDocument: 'after',
      upsert: true,
      setOnInsert: { sequence: startSequence - 1 },
    }
  );

  // Guarantee sequence starts at or above startSequence (1001)
  let currentSeq = counter.sequence;
  if (currentSeq < startSequence) {
    const updated = await DocumentCounter.findOneAndUpdate(
      { type, financial_year: financialYear, sequence: { $lt: startSequence } },
      { $set: { sequence: startSequence } },
      { returnDocument: 'after' }
    );
    currentSeq = updated ? updated.sequence : startSequence;
  }

  const seqNumber = String(currentSeq);

  const invoicePrefix = settings?.prefix_invoice || 'SX/';
  const quotationPrefix = settings?.prefix_quotation || 'Q-';
  const proposalPrefix = settings?.prefix_proposal || 'P-';
  const agreementPrefix = settings?.prefix_agreement || 'SX/NDA/';

  switch (type) {
    case 'invoice':
      return `${invoicePrefix}${financialYear}/${seqNumber}`;
    case 'quotation': {
      const p = quotationPrefix.endsWith('/') ? quotationPrefix.slice(0, -1) : quotationPrefix;
      const cleanPrefix = p.endsWith('-') ? p : `${p}-`;
      return `${cleanPrefix}${financialYear}-${seqNumber}`;
    }
    case 'proposal': {
      const p = proposalPrefix.endsWith('/') ? proposalPrefix.slice(0, -1) : proposalPrefix;
      const cleanPrefix = p.endsWith('-') ? p : `${p}-`;
      return `${cleanPrefix}${financialYear}-${seqNumber}`;
    }
    case 'agreement':
      return `${agreementPrefix}${financialYear}/${seqNumber}`;
    case 'payment':
      return `PAY-${financialYear.replace('-', '')}-${seqNumber}`;
    case 'client':
      return `CLI-${seqNumber}`;
    default:
      return `DOC/${financialYear}/${seqNumber}`;
  }
}
