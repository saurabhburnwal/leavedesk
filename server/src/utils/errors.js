/**
 * An expected, user-facing error. `message` is written for end users;
 * `fields` maps form field names to field-level messages.
 */
export class AppError extends Error {
  constructor(status, code, message, fields = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static validation(message, fields) {
    return new AppError(400, 'VALIDATION_ERROR', message, fields);
  }

  static unauthorized(message = 'Please sign in to continue.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = "You don't have permission to do that.") {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = "We couldn't find what you were looking for.") {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message, fields) {
    return new AppError(409, 'CONFLICT', message, fields);
  }
}

/** Converts zod issues into `{ field: message }` (first message per field wins). */
export function zodIssuesToFields(issues) {
  const fields = {};
  for (const issue of issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Parses `input` with a zod schema or throws a friendly validation error. */
export function parseOrThrow(schema, input, message = 'Please fix the highlighted fields.') {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw AppError.validation(message, zodIssuesToFields(result.error.issues));
  return result.data;
}
