import { readRefreshToken, writeRefreshToken } from './tokenStorage';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || '';
let accessToken = null;
let refreshToken = null;
let expiresAt = 0;
let refreshing = null;
let storageWrite = Promise.resolve();
let sessionExpiredHandler = null;

// The refresh token is persisted by tokenStorage (localStorage on web, SecureStore on native).
// Writes are chained so a sign-out followed quickly by a sign-in cannot land out of order.
export const apiConfigured = Boolean(baseUrl);
export const setAccessToken = (token) => { accessToken = token; };
export const setSession = (session) => {
  accessToken = session?.access_token || null;
  refreshToken = session?.refresh_token || null;
  expiresAt = session?.expires_in ? Date.now() + session.expires_in * 1000 : 0;
  const token = refreshToken;
  storageWrite = storageWrite.then(() => writeRefreshToken(token));
};
export const clearSession = () => setSession(null);
export const storedRefreshToken = readRefreshToken;
export const hasSession = () => Boolean(accessToken);
export const sessionExpiresSoon = (withinMs = 5 * 60 * 1000) => !expiresAt || expiresAt - Date.now() < withinMs;
// AppState registers a local sign-out here; api() calls it when a 401 cannot be fixed by refreshing.
export const onSessionExpired = (handler) => { sessionExpiredHandler = handler; };

// Routes where a 401 means bad credentials, not an expired session.
const PUBLIC_ROUTES = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/forgot-password', '/auth/mfa/verify'];

const send = (path, options) => fetch(`${baseUrl}${path}`, {
  ...options,
  headers: {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...options.headers,
  },
});

// Exchange the refresh token for a new session. Resolves true on success and false if the server
// rejects the token; rejects only on network errors. Concurrent callers share one request, because
// Supabase refresh tokens are single use.
export function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      if (!baseUrl || !refreshToken) return false;
      const response = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }) });
      if (!response.ok) return false;
      setSession(await response.json());
      return true;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, options = {}) {
  if (!baseUrl) throw new Error('API URL is not configured.');
  const sentToken = accessToken;
  let response = await send(path, options);
  // An expired access token: refresh once and retry. Skip the refresh if another request already renewed the token.
  if (response.status === 401 && sentToken && !PUBLIC_ROUTES.includes(path)) {
    const renewed = (accessToken && accessToken !== sentToken) || await refreshSession();
    if (renewed) response = await send(path, options);
    else {
      clearSession();
      sessionExpiredHandler?.();
      throw new Error('Your session has expired. Please sign in again.');
    }
  }
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
  closeAccount: (id) => api(`/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
