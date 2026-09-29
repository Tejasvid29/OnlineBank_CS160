const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || '';
let accessToken = null;

export const apiConfigured = Boolean(baseUrl);
export const setAccessToken = (token) => { accessToken = token; };

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
