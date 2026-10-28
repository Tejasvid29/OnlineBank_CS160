export const demoProfile = {
  first_name: 'Jordan', last_name: 'Taylor', email: 'jordan.taylor@example.com',
  phone: '(415) 555-0184', role: 'customer',
};

export const demoAccounts = [
  { id: 'checking', account_type: 'checking', account_number: '•••• 4821', balance: 8426.72, status: 'activated' },
  { id: 'savings', account_type: 'savings', account_number: '•••• 1904', balance: 21450.00, status: 'activated' },
];

export const demoTransactions = [
  { id: 't1', account_id: 'checking', description: 'Payroll direct deposit', transaction_type: 'Deposit', amount: 3250.00, created_at: '2026-09-26', status: 'Completed' },
  { id: 't2', account_id: 'checking', description: 'Whole Foods Market', transaction_type: 'Card purchase', amount: -86.34, created_at: '2026-09-25', status: 'Completed' },
  { id: 't3', account_id: 'checking', description: 'Electric utility', transaction_type: 'Bill payment', amount: -124.80, created_at: '2026-09-23', status: 'Completed' },
  { id: 't4', account_id: 'savings', description: 'Transfer from checking', transaction_type: 'Transfer', amount: 500.00, created_at: '2026-09-21', status: 'Completed' },
  { id: 't5', account_id: 'checking', description: 'Corner coffee', transaction_type: 'Card purchase', amount: -6.75, created_at: '2026-09-20', status: 'Completed' },
  { id: 't6', account_id: 'checking', description: 'Rent payment', transaction_type: 'Bill payment', amount: -1850.00, created_at: '2026-09-18', status: 'Completed' },
];

export const demoPayments = [
  { id: 'p1', recipient: 'City Electric', account_id: 'checking', amount: 124.80, next_payment_date: '2026-10-05', frequency: 'Monthly', status: 'Scheduled' },
  { id: 'p2', recipient: 'Apartment Rent', account_id: 'checking', amount: 1850.00, next_payment_date: '2026-10-01', frequency: 'Monthly', status: 'Scheduled' },
];

export const demoNotifications = [
  { id: 'n1', message: 'Your payroll deposit of $3,250.00 is available.', notification_type: 'Deposit', created_at: '2026-09-26', read: false },
  { id: 'n2', message: 'Your City Electric payment is scheduled for October 5.', notification_type: 'Bill payment', created_at: '2026-09-24', read: false },
  { id: 'n3', message: 'Your transfer to savings was completed.', notification_type: 'Transfer', created_at: '2026-09-21', read: true },
];

export const demoAtms = [
  { id: 'a1', name: 'Downtown Banking Center', address: '101 California St, San Francisco, CA', distance: '0.4 mi', hours: 'Open 24 hours', latitude: 37.7937, longitude: -122.3987 },
  { id: 'a2', name: 'Market Street ATM', address: '560 Market St, San Francisco, CA', distance: '0.7 mi', hours: 'Open 24 hours', latitude: 37.7894, longitude: -122.4017 },
  { id: 'a3', name: 'Union Square Banking Center', address: '200 Powell St, San Francisco, CA', distance: '1.2 mi', hours: 'Open until 5:00 PM', latitude: 37.7879, longitude: -122.4082 },
];

export const demoManagerData = {
  customers: [
    { id: 'demo-customer-101', first_name: 'Jordan', last_name: 'Taylor' },
    { id: 'demo-customer-102', first_name: 'Alex', last_name: 'Morgan' },
  ],
  accounts: [
    { id: 'demo-account-101', account_type: 'checking', account_number: '•••• 4821', balance: 8426.72, status: 'activated', users: { id: 'demo-customer-101', first_name: 'Jordan', last_name: 'Taylor', zip_code: '94105' } },
    { id: 'demo-account-102', account_type: 'savings', account_number: '•••• 1904', balance: 21450, status: 'activated', users: { id: 'demo-customer-101', first_name: 'Jordan', last_name: 'Taylor', zip_code: '94105' } },
  ],
  reports: [],
};

// Demo-mode twin of GET /manager/reports/summary (backend/reports.py): filter accounts, group, and aggregate.
export function buildReport(accounts, f) {
  const owner = (a) => a.users || {};
  const rows = accounts.filter((a) => (!f.zip_code || owner(a).zip_code === f.zip_code)
    && (!f.account_type || a.account_type === f.account_type)
    && (!f.account_status || a.status === f.account_status)
    && (f.min_balance === undefined || a.balance >= Number(f.min_balance))
    && (f.max_balance === undefined || a.balance <= Number(f.max_balance))
    && (!f.created_from || (a.created_at || '') >= f.created_from)
    && (!f.created_to || (a.created_at || '') <= f.created_to));
  const label = (a) => ({
    zip_code: owner(a).zip_code || 'Unknown', account_type: a.account_type, account_status: a.status,
    customer: `${owner(a).first_name || ''} ${owner(a).last_name || ''}`.trim() || 'Unknown',
  }[f.group_by] || 'All accounts');
  const summarize = (list) => {
    const balances = list.map((a) => Number(a.balance));
    const sum = balances.reduce((s, b) => s + b, 0);
    return {
      customer_count: new Set(list.map((a) => owner(a).id)).size, account_count: list.length, total_balance: sum,
      average_balance: list.length ? sum / list.length : 0, min_balance: balances.length ? Math.min(...balances) : 0, max_balance: balances.length ? Math.max(...balances) : 0,
    };
  };
  const grouped = {};
  rows.forEach((a) => { (grouped[label(a)] ||= []).push(a); });
  const groups = Object.entries(grouped).map(([group, list]) => ({ group, ...summarize(list) })).sort((a, b) => b.total_balance - a.total_balance);
  return { group_by: f.group_by || 'none', totals: summarize(rows), groups };
}
