/**
 * Tiny fetch wrapper for the mailverify backend.
 *
 * - Prefixes every path with `${VITE_API_URL}/api/v1`.
 * - Attaches `Authorization: Bearer <token>` when a token is provided.
 * - Parses JSON and throws an `ApiError` (with a friendly message) on non-2xx.
 * - Surfaces 401 so the AuthContext can log the user out.
 */

// Vite inlines import.meta.env.VITE_API_URL at build time.
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_ROOT = `${API_BASE}/api/v1`;

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Turn a response status + server body into a friendly, user-facing message.
 */
function friendlyMessage(status, serverMessage) {
  switch (status) {
    case 401:
      return 'Your session has expired. Please log in again.';
    case 402:
      return "You're out of credits. Top up to keep verifying.";
    case 403:
      return serverMessage || 'You do not have access to this resource.';
    case 404:
      return serverMessage || 'Not found.';
    case 409:
      return serverMessage || 'That already exists.';
    case 429:
      return 'Too many requests — please slow down and try again.';
    case 503:
      return 'The service is temporarily unavailable. Please try again shortly.';
    default:
      if (status >= 500) return 'Something went wrong on our end. Please try again.';
      return serverMessage || 'Request failed.';
  }
}

/**
 * Core request function.
 *
 * @param {string} path     e.g. "/auth/login"
 * @param {object} [opts]
 * @param {string} [opts.method]
 * @param {object} [opts.body]   JSON-serializable body
 * @param {string} [opts.token]  bearer token
 * @returns {Promise<any>} parsed JSON (or null for empty responses)
 */
export async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_ROOT}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // fetch throws only on network failure / CORS / DNS.
    throw new ApiError(
      'Cannot reach the server. Check your connection and try again.',
      0,
      null
    );
  }

  // Parse JSON if present; tolerate empty bodies.
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const serverMessage = data && (data.error || data.message);
    throw new ApiError(friendlyMessage(res.status, serverMessage), res.status, data);
  }

  return data;
}

/**
 * Convenience methods grouped by area. Each takes a token where auth is needed.
 */
export const api = {
  // --- Auth ---
  signup: (email, password) =>
    request('/auth/signup', { method: 'POST', body: { email, password } }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token) => request('/auth/me', { token }),

  // --- Account ---
  credits: (token) => request('/account/credits', { token }),
  usage: (token) => request('/account/usage', { token }),
  history: (token, { limit = 25, offset = 0 } = {}) =>
    request(`/account/history?limit=${limit}&offset=${offset}`, { token }),
  listApiKeys: (token) => request('/account/api-keys', { token }),
  createApiKey: (token, name) =>
    request('/account/api-keys', { method: 'POST', body: { name }, token }),
  revokeApiKey: (token, id) =>
    request(`/account/api-keys/${id}`, { method: 'DELETE', token }),

  // --- Verify ---
  verifySingle: (token, email) =>
    request('/verify/single', { method: 'POST', body: { email }, token }),

  // --- Bulk ---
  bulkUpload: (token, file) => bulkUpload(token, file),
  listBulkJobs: (token) => request('/bulk/jobs', { token }),
  getBulkJob: (token, id) => request(`/bulk/jobs/${id}`, { token }),
  bulkDownload: (token, id, filename) => bulkDownload(token, id, filename),

  // --- Admin (role-gated server-side: admin or manager) ---
  adminGetStats: (token) => request('/admin/stats', { token }),
  adminListUsers: (token, { limit = 50, offset = 0, search = '' } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set('search', search);
    return request(`/admin/users?${params.toString()}`, { token });
  },
  adminGetUser: (token, id) => request(`/admin/users/${id}`, { token }),
  adminSetCredits: (token, id, { amount, mode }) =>
    request(`/admin/users/${id}/credits`, {
      method: 'POST',
      body: { amount, mode },
      token,
    }),
  adminSetStatus: (token, id, status) =>
    request(`/admin/users/${id}/status`, {
      method: 'PATCH',
      body: { status },
      token,
    }),
  adminSetRole: (token, id, role) =>
    request(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: { role },
      token,
    }),

  // --- Payments (customer) ---
  paymentsGetPackages: (token) => request('/payments/packages', { token }),
  paymentsGetMethods: (token) => request('/payments/methods', { token }),
  paymentsCreateRequest: (token, body) =>
    request('/payments/requests', { method: 'POST', body, token }),
  paymentsListMyRequests: (token) => request('/payments/requests', { token }),

  // --- Payments (admin/manager) ---
  adminListPayments: (token, { status = '', limit = 50, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set('status', status);
    return request(`/admin/payments?${params.toString()}`, { token });
  },
  adminApprovePayment: (token, id) =>
    request(`/admin/payments/${id}/approve`, { method: 'POST', token }),
  adminRejectPayment: (token, id, adminNote) =>
    request(`/admin/payments/${id}/reject`, {
      method: 'POST',
      body: { admin_note: adminNote },
      token,
    }),
};

/**
 * Upload a CSV/TXT file for bulk verification.
 *
 * Sends multipart/form-data with the file under the field name "file".
 * We deliberately do NOT set Content-Type — the browser adds it along with the
 * multipart boundary. We still attach the Bearer token and reuse the same
 * friendly-error handling as `request()`.
 */
async function bulkUpload(token, file) {
  const form = new FormData();
  form.append('file', file);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_ROOT}/bulk/upload`, {
      method: 'POST',
      headers, // no Content-Type — let the browser set the boundary
      body: form,
    });
  } catch {
    throw new ApiError(
      'Cannot reach the server. Check your connection and try again.',
      0,
      null
    );
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const serverMessage = data && (data.error || data.message);
    throw new ApiError(friendlyMessage(res.status, serverMessage), res.status, data);
  }

  return data;
}

/**
 * Fetch a completed job's result CSV (with the Bearer header) and trigger a
 * browser download via an object URL. We fetch-as-blob rather than opening a
 * link because the endpoint requires the Authorization header.
 */
async function bulkDownload(token, id, filename) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_ROOT}/bulk/jobs/${id}/download`, { headers });
  } catch {
    throw new ApiError(
      'Cannot reach the server. Check your connection and try again.',
      0,
      null
    );
  }

  if (!res.ok) {
    let serverMessage;
    try {
      const data = JSON.parse(await res.text());
      serverMessage = data && (data.error || data.message);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(friendlyMessage(res.status, serverMessage), res.status, null);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `bulk-results-${id}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export { API_BASE, API_ROOT };
