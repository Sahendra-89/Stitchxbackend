import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const protectedStorageDir = path.join(__dirname, '..', 'data', 'documents');
if (!fs.existsSync(protectedStorageDir)) {
  fs.mkdirSync(protectedStorageDir, { recursive: true });
}

// Strict Allowlist of permitted business document extensions and their verified MIME types
const ALLOWED_DOCUMENT_MIME_MAP = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.csv': ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
  '.txt': ['text/plain'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, protectedStorageDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = Object.keys(ALLOWED_DOCUMENT_MIME_MAP).includes(ext) ? ext : '.bin';
    const safeBase = crypto.randomUUID();
    cb(null, `${safeBase}${safeExt}`);
  },
});

export const documentUpload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const originalName = file.originalname || '';

    // 1. Prevent path traversal in originalname
    if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
      return cb(new Error('Invalid filename detected: path traversal sequences are prohibited.'));
    }

    const ext = path.extname(originalName).toLowerCase();
    const allowedMimes = ALLOWED_DOCUMENT_MIME_MAP[ext];

    // 2. Strict allowlist check: extension must be explicitly approved
    if (!allowedMimes) {
      return cb(
        new Error(`Unsupported file extension: ${ext || 'none'}. Allowed formats: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, JPG, PNG, WEBP.`)
      );
    }

    // 3. Strict MIME check: MIME type must correspond to approved extension
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(
        new Error(`MIME type mismatch for file (${file.mimetype}). Uploaded content does not match extension ${ext}.`)
      );
    }

    cb(null, true);
  },
});
