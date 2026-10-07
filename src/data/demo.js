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
    { id: 'demo-account-101', account_type: 'checking', account_number: '•••• 4821', balance: 8426.72, status: 'activated' },
    { id: 'demo-account-102', account_type: 'savings', account_number: '•••• 1904', balance: 21450, status: 'activated' },
  ],
  reports: [],
};
