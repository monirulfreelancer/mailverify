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
};

export { API_BASE, API_ROOT };
