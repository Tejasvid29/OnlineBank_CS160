const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || '';
let accessToken = null;
const REFRESH_KEY = 'bank_refresh_token';

// The refresh token survives page reloads on web only; native sessions stay in memory.
const storage = typeof localStorage !== 'undefined' ? localStorage : null;
const readRefreshToken = () => { try { return storage?.getItem(REFRESH_KEY) || null; } catch { return null; } };
const writeRefreshToken = (token) => { try { token ? storage?.setItem(REFRESH_KEY, token) : storage?.removeItem(REFRESH_KEY); } catch { /* Storage unavailable. */ } };

export const apiConfigured = Boolean(baseUrl);
export const setAccessToken = (token) => { accessToken = token; };
export const setSession = (session) => { accessToken = session?.access_token || null; writeRefreshToken(session?.refresh_token || null); };
export const clearSession = () => setSession(null);
export const storedRefreshToken = readRefreshToken;

export async function api(path, options = {}) {
  if (!baseUrl) throw new Error('API URL is not configured.');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let message = 'The request could not be completed.';
    try {
      const body = await response.json();
      message = body.detail || body.message || message;
    } catch { /* Keep a safe generic message. */ }
    throw new Error(typeof message === 'string' ? message : 'The request could not be completed.');
  }
  if (response.status === 204) return null;
  return response.json();
}

export const bankingApi = {
  login: (email, password) => api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (payload) => api('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  refresh: (refresh_token) => api('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token }) }),
  me: () => api('/auth/me'),
  logout: () => api('/auth/logout', { method: 'POST' }),
  forgotPassword: (email) => api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyMfa: (code) => api('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  accounts: () => api('/accounts'),
  createAccount: (payload) => api('/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  closeAccount: (id) => api(`/accounts/${encodeURIComponent(id)}/close`, { method: 'POST' }),
  transactions: (accountId) => api(`/accounts/${encodeURIComponent(accountId)}/transactions`),
  transfer: (payload) => api('/transfers', { method: 'POST', body: JSON.stringify(payload) }),
  payments: () => api('/bill-payments'),
  createPayment: (payload) => api('/bill-payments', { method: 'POST', body: JSON.stringify(payload) }),
  cancelPayment: (id) => api(`/bill-payments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  notifications: () => api('/notifications'),
  markNotificationRead: (id) => api(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
  atms: (location) => api(`/atm/search?location=${encodeURIComponent(location)}`),
  managerCustomers: () => api('/manager/customers'),
  managerAccounts: () => api('/manager/accounts'),
  managerReports: () => api('/manager/reports'),
};
