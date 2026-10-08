export const NAV = [
  ['/', 'Overview', 'grid-outline'],
  ['/accounts', 'Accounts', 'wallet-outline'],
  ['/transfer', 'Pay & transfer', 'swap-horizontal-outline'],
  ['/send', 'Send Money', 'paper-plane-outline'],
  ['/payments', 'Bill payments', 'calendar-outline'],
  ['/activity', 'Activity', 'list-outline'],
  ['/checks', 'Deposit checks', 'camera-outline'],
  ['/atms', 'Find an ATM', 'location-outline'],
  ['/profile', 'Profile & settings', 'person-outline'],
];

// Native bottom tabs: [path, label, icon, paths that highlight the tab]. Web uses NAV above.
export const MOBILE_TABS = [
  ['/', 'Overview', 'grid-outline', ['/']],
  ['/accounts', 'Accounts', 'wallet-outline', ['/accounts']],
  ['/transfer', 'Pay & Transfer', 'swap-horizontal-outline', ['/transfer', '/payments']],
  ['/checks', 'Deposit', 'camera-outline', ['/checks']],
];

export const MOBILE_PAY_NAV = [
  ['/transfer', 'Transfer'],
  ['/payments', 'Bill pay'],
];

export const MOBILE_MORE = [
  ['/send', 'Send Money', 'paper-plane-outline'],
  ['/activity', 'Activity', 'list-outline'],
  ['/atms', 'Find an ATM', 'location-outline'],
  ['/profile', 'Profile & settings', 'person-outline'],
];
