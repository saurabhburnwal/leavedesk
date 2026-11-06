/** Error thrown for any failed API call. `message` is always safe to show to users. */
export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || {};
  }
}

const FALLBACK_MESSAGES = {
  400: 'Some of the details are not valid. Please check and try again.',
  401: 'Please sign in to continue.',
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: 'This item was changed in the meantime. Please refresh and try again.',
  413: 'The upload is too large.',
  429: 'Too many attempts. Please wait a moment and try again.',
};

let onUnauthorized = null;
/** Lets the auth layer react when a session expires mid-use. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

/** Shared fetch helper. Feature modules (e.g. src/api/notifications.js) should import this. */
export async function request(method, url, body) {
  const options = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body instanceof FormData) {
    options.body = body; // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check that it is running and try again.");
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const e = data?.error;
    const error = new ApiError(
      res.status,
      e?.code || `HTTP_${res.status}`,
      e?.message || FALLBACK_MESSAGES[res.status] || 'Something went wrong. Please try again.',
      e?.fields,
    );
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized?.(error);
    throw error;
  }
  return data;
}

const qs = (params) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const s = search.toString();
  return s ? `?${s}` : '';
};

export const Api = {
  me: () => request('GET', '/api/auth/me'),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  logout: () => request('POST', '/api/auth/logout', {}),
  policy: () => request('GET', '/api/policy'),
  dashboard: () => request('GET', '/api/dashboard'),

  myLeaves: (status) => request('GET', `/api/leaves${qs({ status })}`),
  leave: (id) => request('GET', `/api/leaves/${id}`),
  createLeave: (formData) => request('POST', '/api/leaves', formData),
  updateLeave: (id, formData) => request('PATCH', `/api/leaves/${id}`, formData),
  cancelLeave: (id, comment) => request('POST', `/api/leaves/${id}/cancel`, { comment }),
  respond: (id, formData) => request('POST', `/api/leaves/${id}/respond`, formData),
  addDocuments: (id, formData) => request('POST', `/api/leaves/${id}/documents`, formData),

  pendingApprovals: () => request('GET', '/api/approvals/pending'),
  teamLeaves: (status) => request('GET', `/api/approvals/team${qs({ status })}`),
  approve: (id, comment) => request('POST', `/api/leaves/${id}/approve`, { comment }),
  reject: (id, comment) => request('POST', `/api/leaves/${id}/reject`, { comment }),
  requestInfo: (id, comment) => request('POST', `/api/leaves/${id}/request-info`, { comment }),

  auditLogs: ({ action, offset = 0, limit = 50 } = {}) => request('GET', `/api/audit-logs${qs({ action, offset, limit })}`),
};

export const documentUrl = (id, download = false) => `/api/documents/${id}${download ? '?download=1' : ''}`;
