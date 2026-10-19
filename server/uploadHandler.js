import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { resumesDir, uploadsDir, JobApplication } from './db.js';
import { isValidObjectId } from './security/validation.js';

// Strict Extension-to-MIME Allowlist for Resumes
const RESUME_MIME_MAP = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

// Strict Extension-to-MIME Allowlist for Public Images
// NOTE: SVG (.svg) is intentionally excluded from public raster uploads to prevent Stored XSS
const IMAGE_MIME_MAP = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
};

// Resume Storage Configuration (Protected, Admin-only access)
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, resumesDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = Object.keys(RESUME_MIME_MAP).includes(ext) ? ext : '.pdf';
    const safeName = `${crypto.randomBytes(16).toString('hex')}${safeExt}`;
    cb(null, safeName);
  },
});

const resumeFileFilter = (req, file, cb) => {
  const originalName = file.originalname || '';
  if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
    return cb(new Error('Invalid filename: Path traversal sequence detected.'));
  }

  const ext = path.extname(originalName).toLowerCase();
  const allowedMimes = RESUME_MIME_MAP[ext];

  if (!allowedMimes || !allowedMimes.includes(file.mimetype)) {
    return cb(
      new Error('Invalid resume file type. Only genuine PDF, DOC, and DOCX files are permitted.')
    );
  }

  cb(null, true);
};

export const resumeUpload = multer({
  storage: resumeStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1,
  },
  fileFilter: resumeFileFilter,
});

// Image Storage Configuration (Publicly served uploads for blog covers, avatars)
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = Object.keys(IMAGE_MIME_MAP).includes(ext) ? ext : '.jpg';
    const safeName = `${crypto.randomBytes(16).toString('hex')}${safeExt}`;
    cb(null, safeName);
  },
});

const imageFileFilter = (req, file, cb) => {
  const originalName = file.originalname || '';
  if (originalName.includes('..') || originalName.includes('/') || originalName.includes('\\')) {
    return cb(new Error('Invalid filename: Path traversal sequence detected.'));
  }

  const ext = path.extname(originalName).toLowerCase();
  const allowedMimes = IMAGE_MIME_MAP[ext];

  // Disallow SVG to prevent script execution inside SVG images (Stored XSS)
  if (ext === '.svg' || file.mimetype.includes('svg')) {
    return cb(
      new Error('SVG uploads are prohibited for security reasons. Please upload PNG, JPG, WEBP, or GIF.')
    );
  }

  if (!allowedMimes || !allowedMimes.includes(file.mimetype)) {
    return cb(
      new Error('Invalid image file type. Only genuine JPG, PNG, WEBP, and GIF images are permitted.')
    );
  }

  cb(null, true);
};

export const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1,
  },
  fileFilter: imageFileFilter,
});

/**
 * Secure handler for downloading/viewing applicant resumes.
 * Requires admin authentication.
 */
export async function handleDownloadResume(req, res) {
  const appId = req.params.id;
  if (!appId || !isValidObjectId(appId)) {
    return res.status(400).json({ success: false, error: 'A valid Application ID is required.' });
  }

  let application;
  try {
    application = await JobApplication.findById(appId);
  } catch {
    application = null;
  }

  if (!application) {
    return res.status(404).json({ success: false, error: 'Application record not found.' });
  }

  // If local file stored
  if (application.resume_filename) {
    const safeBase = path.basename(application.resume_filename);
    const resolvedPath = path.resolve(resumesDir, safeBase);

    // Verify path stays within resumes directory (Anti-Path Traversal)
    if (!resolvedPath.startsWith(path.resolve(resumesDir))) {
      return res.status(403).json({ success: false, error: 'Access Denied: Path traversal detected.' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, error: 'Stored resume file not found on disk.' });
    }

    // Set defensive download headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");

    const safeCandidateName = (application.full_name || 'Candidate').replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadName = `${safeCandidateName}_Resume${path.extname(safeBase)}`;
    return res.download(resolvedPath, downloadName);
  }

  // If external URL provided
  if (application.resume_url) {
    return res.json({
      success: true,
      externalUrl: application.resume_url,
    });
  }

  return res.status(404).json({ success: false, error: 'No resume attached to this application.' });
}
