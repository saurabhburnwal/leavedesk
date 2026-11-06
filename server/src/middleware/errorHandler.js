import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { POLICY } from '../services/policy.js';
import { removeUploadedFiles } from './upload.js';

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `Each file must be ${POLICY.MAX_FILE_SIZE_MB} MB or smaller.`,
  LIMIT_FILE_COUNT: `You can attach up to ${POLICY.MAX_FILES_PER_UPLOAD} files at a time.`,
  LIMIT_UNEXPECTED_FILE: 'Attach files using the "documents" field.',
};

/**
 * Turns every error into the same JSON shape:
 *   { error: { code, message, fields? } }
 * Expected errors get a friendly message; unexpected ones are logged and hidden.
 */
export function errorHandler(err, req, res, _next) {
  removeUploadedFiles(req.files);

  let error = err;
  if (err instanceof multer.MulterError) {
    error = AppError.validation(MULTER_MESSAGES[err.code] ?? 'The upload could not be processed.', {
      documents: MULTER_MESSAGES[err.code] ?? 'Upload failed.',
    });
  } else if (err?.type === 'entity.parse.failed') {
    error = AppError.validation('The request body is not valid JSON.');
  } else if (err?.type === 'entity.too.large') {
    error = AppError.validation('The request is too large.');
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, fields: error.fields } });
  }

  console.error(`[${new Date().toISOString()}] [req ${req.id}] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: `Something went wrong on our side. Please try again in a moment. (Reference: ${req.id})`,
    },
  });
}
