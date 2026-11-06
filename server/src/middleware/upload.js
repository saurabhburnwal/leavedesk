import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { ALLOWED_UPLOADS, POLICY } from '../services/policy.js';

const ALLOWED_EXTENSIONS = Object.values(ALLOWED_UPLOADS).flat();

/**
 * Multipart upload handling for supporting documents.
 * - Files are stored under a random name (never the user's file name) to prevent path tricks.
 * - Both the MIME type and the extension must be on the allow-list.
 * - Size and count are limited.
 */
export function createUploader(uploadDir) {
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: POLICY.MAX_FILE_SIZE_MB * 1024 * 1024, files: POLICY.MAX_FILES_PER_UPLOAD },
    fileFilter: (_req, file, cb) => {
      file.originalname = cleanFileName(file.originalname);
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedForType = ALLOWED_UPLOADS[file.mimetype] ?? [];
      if (!allowedForType.includes(ext)) {
        return cb(
          AppError.validation(`"${file.originalname}" is not a supported file. Upload PDF, JPG, PNG, DOC or DOCX files.`, {
            documents: `Allowed file types: ${ALLOWED_EXTENSIONS.join(', ')}`,
          }),
        );
      }
      cb(null, true);
    },
  });

  // Field name used by the frontend form: <input type="file" name="documents" multiple>
  return upload.array('documents', POLICY.MAX_FILES_PER_UPLOAD);
}

/** Browsers send UTF-8 file names that busboy decodes as latin1; fix that and strip path parts. */
function cleanFileName(name) {
  let decoded = name;
  try {
    decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) decoded = name;
  } catch {
    decoded = name;
  }
  return path.basename(decoded).replace(/[\u0000-\u001f"\\]/g, '_').slice(0, 150) || 'document';
}

/** Deletes files from a failed request so rejected uploads don't pile up on disk. */
export function removeUploadedFiles(files = []) {
  for (const file of files) {
    if (file?.path) fs.rm(file.path, { force: true }, () => {});
  }
}
