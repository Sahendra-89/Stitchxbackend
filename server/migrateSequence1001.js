import mongoose from 'mongoose';
import dotenv from 'dotenv';
import {
  CompanySettings,
  DocumentCounter,
  DocInvoice,
  DocQuotation,
  DocProposal,
  DocAgreement,
  DocPayment,
} from './models/index.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/techfusion';

async function migrateToSequence1001() {
  await mongoose.connect(MONGODB_URI);
  console.log('[MongoDB] Connected for sequence 1001 migration');

  // 1. Update CompanySettings
  await CompanySettings.updateOne(
    {},
    {
      $set: {
        start_sequence: 1001,
        address: 'Sector 9A , Gurugram',
      },
    },
    { upsert: true }
  );
  console.log('[Migration] CompanySettings start_sequence set to 1001');

  // 2. Remove dummy test client records
  await DocInvoice.deleteMany({ 'client_snapshot.name': 'Test Client Enterprise' });
  await DocQuotation.deleteMany({ 'client_snapshot.name': 'Test Client Enterprise' });
  await DocProposal.deleteMany({ 'client_snapshot.name': 'Test Client Enterprise' });
  await DocAgreement.deleteMany({ second_party_name: 'Test Client Enterprise' });
  console.log('[Migration] Removed dummy seed test records');

  // 3. Renumber Altera Interior records to start at 1001
  const updatedProposal = await DocProposal.findOneAndUpdate(
    { proposal_number: 'SX/P/2026-27/004' },
    { $set: { proposal_number: 'SX/P/2026-27/1001' } },
    { returnDocument: 'after' }
  );
  if (updatedProposal) {
    console.log('[Migration] Renumbered Proposal to SX/P/2026-27/1001');
  }

  const updatedQuotation = await DocQuotation.findOneAndUpdate(
    { quotation_number: 'SX/Q/2026-27/004' },
    { $set: { quotation_number: 'SX/Q/2026-27/1001' } },
    { returnDocument: 'after' }
  );
  if (updatedQuotation) {
    console.log('[Migration] Renumbered Quotation to SX/Q/2026-27/1001');
  }

  const updatedInvoice = await DocInvoice.findOneAndUpdate(
    { invoice_number: 'SX/2026-27/004' },
    {
      $set: {
        invoice_number: 'SX/2026-27/1001',
        related_quotation_number: 'SX/Q/2026-27/1001',
        related_proposal_number: 'SX/P/2026-27/1001',
      },
    },
    { returnDocument: 'after' }
  );
  if (updatedInvoice) {
    console.log('[Migration] Renumbered Invoice to SX/2026-27/1001');
  }

  const updatedAgreement = await DocAgreement.findOneAndUpdate(
    { agreement_number: 'SX/NDA/2026-27/004' },
    { $set: { agreement_number: 'SX/NDA/2026-27/1001' } },
    { returnDocument: 'after' }
  );
  if (updatedAgreement) {
    console.log('[Migration] Renumbered Agreement to SX/NDA/2026-27/1001');
  }

  // 4. Update Document Counters to 1001
  const docTypes = ['invoice', 'quotation', 'proposal', 'agreement', 'client', 'payment'];
  for (const type of docTypes) {
    await DocumentCounter.findOneAndUpdate(
      { type, financial_year: '2026-27' },
      { $set: { sequence: 1001 } },
      { upsert: true }
    );
  }
  console.log('[Migration] DocumentCounter sequence set to 1001 for all types');

  console.log('[Migration] Migration complete!');
  process.exit(0);
}

migrateToSequence1001().catch((err) => {
  console.error('[Migration Error]', err);
  process.exit(1);
});
