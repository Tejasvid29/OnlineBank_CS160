export const colors = {
  navy: '#073B66',
  blue: '#005EB8',
  blueDark: '#004B93',
  sky: '#EAF4FC',
  ink: '#18334B',
  muted: '#5D7182',
  border: '#DCE5EB',
  canvas: '#F5F8FA',
  white: '#FFFFFF',
  green: '#18734B',
  red: '#B53139',
  amber: '#8F5D00',
};

// Accounts come from the API as lowercase values ('checking', 'activated'); show them capitalized.
export const titleCase = (value = '') => value.charAt(0).toUpperCase() + value.slice(1);
export const isActivated = (account) => account.status === 'activated';

// Manager searches: every word typed must appear somewhere in the values (any order, ignoring case).
export const searchWords = (query = '') => query.trim().toLowerCase().split(/\s+/).filter(Boolean);
export const matchesWords = (words, values) => {
  const text = values.filter((value) => value != null).join(' ').toLowerCase();
  return words.every((word) => text.includes(word));
};

export const money = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export const dateLabel = (value) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// What a manager can search a check deposit by: customer name and email, account number and amount ("500", "500.00",
// "$1,250.00" all match).
export const checkSearchValues = (deposit) => [
  deposit.customer?.first_name, deposit.customer?.last_name, deposit.customer?.email, deposit.account?.account_number,
  money(deposit.amount), String(deposit.amount), Number(deposit.amount).toFixed(2),
];
