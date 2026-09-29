import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiConfigured, bankingApi, setAccessToken } from './src/services/api';
import { demoAccounts, demoAtms, demoManagerData, demoNotifications, demoPayments, demoProfile, demoTransactions } from './src/data/demo';
import { colors, dateLabel, money } from './src/theme';

const NAV = [
  ['overview', 'Overview', 'grid-outline'],
  ['accounts', 'Accounts', 'wallet-outline'],
  ['transfer', 'Pay & transfer', 'swap-horizontal-outline'],
  ['payments', 'Bill payments', 'calendar-outline'],
  ['activity', 'Activity', 'list-outline'],
  ['checks', 'Deposit checks', 'camera-outline'],
  ['atms', 'Find an ATM', 'location-outline'],
  ['profile', 'Profile & settings', 'person-outline'],
];

const isWeb = Platform.OS === 'web';
const now = new Date();
const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const unwrap = (value, key) => Array.isArray(value) ? value : value?.[key] || [];
const validMoney = (value, allowZero = false) => /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && (allowZero ? Number(value) >= 0 : Number(value) > 0);
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

function Icon({ name, size = 20, color = colors.blue }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function Action({ children, onPress, variant = 'primary', icon, disabled = false, style }) {
  const primary = variant === 'primary';
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, primary ? styles.actionPrimary : styles.actionSecondary, disabled && styles.disabled, pressed && styles.pressed, style]}>
    {icon && <Icon name={icon} size={17} color={primary ? colors.white : colors.blue} />}
    <Text style={[styles.actionText, { color: primary ? colors.white : colors.blue }]}>{children}</Text>
  </Pressable>;
}

function LinkButton({ children, onPress, icon }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkButton}>
    <Text style={styles.linkText}>{children}</Text>{icon && <Icon name={icon} size={16} />}
  </Pressable>;
}

function Card({ children, style }) { return <View style={[styles.card, style]}>{children}</View>; }
function Divider() { return <View style={styles.divider} />; }
function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, accessibilityHint }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityHint={accessibilityHint} style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8294A2" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize || 'none'} />
  </View>;
}
function Choice({ label, value, options, onChange }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choiceRow}>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceActive]}><Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text></Pressable>)}</View></View>;
}
function SectionHeading({ title, subtitle, action, onAction }) {
  return <View style={styles.sectionHeading}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{action && <LinkButton onPress={onAction} icon="arrow-forward">{action}</LinkButton>}</View>;
}
function Status({ children, color = colors.green }) { return <View style={[styles.status, { backgroundColor: color + '14' }]}><View style={[styles.statusDot, { backgroundColor: color }]} /><Text style={[styles.statusText, { color }]}>{children}</Text></View>; }
function Notice({ text, kind = 'info' }) { return text ? <View style={[styles.notice, kind === 'error' && styles.noticeError, kind === 'success' && styles.noticeSuccess]}><Icon name={kind === 'error' ? 'alert-circle-outline' : kind === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={19} color={kind === 'error' ? colors.red : kind === 'success' ? colors.green : colors.blue} /><Text style={styles.noticeText}>{text}</Text></View> : null; }

export default function App() {
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const [signedIn, setSignedIn] = useState(false);
  const [page, setPage] = useState('overview');
  const [authView, setAuthView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState(apiConfigured ? {} : demoProfile);
  const [accounts, setAccounts] = useState(apiConfigured ? [] : demoAccounts);
  const [transactions, setTransactions] = useState(apiConfigured ? [] : demoTransactions);
  const [payments, setPayments] = useState(apiConfigured ? [] : demoPayments);
  const [notifications, setNotifications] = useState(apiConfigured ? [] : demoNotifications);
  const [selectedAccount, setSelectedAccount] = useState('checking');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [newAccountType, setNewAccountType] = useState('Checking');
  const [newAccountDeposit, setNewAccountDeposit] = useState('0');
  const [pendingCloseId, setPendingCloseId] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [managerData, setManagerData] = useState(apiConfigured ? { customers: [], accounts: [], reports: [] } : demoManagerData);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerReportFilter, setManagerReportFilter] = useState('All');
  const [showManagerReport, setShowManagerReport] = useState(false);
  const [transferFrom, setTransferFrom] = useState('checking');
  const [transferTo, setTransferTo] = useState('savings');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [payee, setPayee] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [frequency, setFrequency] = useState('Once');
  const [atmSearch, setAtmSearch] = useState('San Francisco, CA');
  const [atms, setAtms] = useState(demoAtms);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionType, setTransactionType] = useState('All');
  const [transactionStart, setTransactionStart] = useState('');
  const [transactionEnd, setTransactionEnd] = useState('');
  const [profileDraft, setProfileDraft] = useState(apiConfigured ? { first_name: '', last_name: '', phone: '' } : { first_name: demoProfile.first_name, last_name: demoProfile.last_name, phone: demoProfile.phone });

  const unread = notifications.filter((item) => !item.read).length;
  const activeAccount = accounts.find((item) => item.id === selectedAccount) || accounts[0];
  const isManager = profile.role === 'manager' || profile.role === 'employee' || profile.role === 'admin';
  const total = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const visibleTransactions = useMemo(() => transactions.filter((item) => {
    const matchAccount = page === 'activity' ? selectedAccount === 'all' || item.account_id === selectedAccount : true;
    const matchQuery = item.description.toLowerCase().includes(transactionSearch.toLowerCase());
    const matchType = transactionType === 'All' || item.transaction_type === transactionType;
    const matchStart = !transactionStart || item.created_at.slice(0, 10) >= transactionStart;
    const matchEnd = !transactionEnd || item.created_at.slice(0, 10) <= transactionEnd;
    return matchAccount && matchQuery && matchType && matchStart && matchEnd;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at)), [transactions, page, selectedAccount, transactionSearch, transactionType, transactionStart, transactionEnd]);

  function navigate(next) { setPage(next); setNotice(''); setShowNotifications(false); if (isWeb) window.scrollTo?.({ top: 0, behavior: 'smooth' }); }
  function fail(error) { setNotice(error?.message || 'Something went wrong. Please try again.'); }

  async function loadData() {
    if (!apiConfigured) return;
    const [me, accountResult, paymentResult, notificationResult] = await Promise.all([
        bankingApi.me(), bankingApi.accounts(), bankingApi.payments(), bankingApi.notifications(),
    ]);
    const nextProfile = me.profile || me;
    const nextAccounts = unwrap(accountResult, 'accounts');
    const lists = await Promise.all(nextAccounts.map((account) => bankingApi.transactions(account.id)));
    setProfile(nextProfile);
    setProfileDraft({ first_name: nextProfile.first_name || '', last_name: nextProfile.last_name || '', phone: nextProfile.phone || '' });
    setAccounts(nextAccounts);
    setSelectedAccount(nextAccounts[0]?.id || 'all');
    setTransferFrom(nextAccounts[0]?.id || '');
    setTransferTo(nextAccounts[1]?.id || '');
    setPayments(unwrap(paymentResult, 'payments'));
    setNotifications(unwrap(notificationResult, 'notifications'));
    setTransactions(lists.flatMap((result) => unwrap(result, 'transactions')));
  }

  async function signIn() {
    setNotice('');
    if (!apiConfigured) { setSignedIn(true); return; }
    if (!email.trim() || !password) { setNotice('Enter your email and password.'); return; }
    setBusy(true);
    try {
      const result = await bankingApi.login(email.trim(), password);
      if (result.mfa_required) setAuthView('mfa');
      else { setAccessToken(result.access_token || result.token); await loadData(); setSignedIn(true); }
    } catch (error) { setAccessToken(null); fail(error); }
    finally { setBusy(false); }
  }

  async function verifyMfa() {
    if (!mfaCode.trim()) { setNotice('Enter your verification code.'); return; }
    setBusy(true); setNotice('');
    try {
      const result = await bankingApi.verifyMfa(mfaCode.trim());
      if (result.access_token || result.token) setAccessToken(result.access_token || result.token);
      await loadData(); setSignedIn(true);
    } catch (error) { setAccessToken(null); fail(error); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!email.trim()) { setNotice('Enter your email address.'); return; }
    setBusy(true); setNotice('');
    try { await bankingApi.forgotPassword(email.trim()); setNotice('If this address is registered, a reset link will be sent.'); }
    catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (apiConfigured) { try { await bankingApi.logout(); } catch { /* Clear the local session regardless. */ } }
    setAccessToken(null); setSignedIn(false); setPassword(''); setMfaCode(''); setAuthView('login'); setPage('overview'); setNotice('');
  }

  async function submitTransfer() {
    const amount = Number(transferAmount);
    if (!transferFrom || !transferTo || transferFrom === transferTo) { setNotice('Choose two different accounts.'); return; }
    if (!validMoney(transferAmount)) { setNotice('Enter an amount greater than $0 with up to two decimal places.'); return; }
    const source = accounts.find((item) => item.id === transferFrom);
    if (source && amount > Number(source.available ?? source.balance)) { setNotice('The source account has insufficient funds.'); return; }
    setBusy(true); setNotice('');
    try {
      if (apiConfigured) {
        await bankingApi.transfer({ source_account_id: transferFrom, destination_account_id: transferTo, amount, transfer_type: 'internal', description: transferNote });
        await loadData();
      } else {
        setAccounts((current) => current.map((account) => account.id === transferFrom ? { ...account, balance: account.balance - amount, available: account.available - amount } : account.id === transferTo ? { ...account, balance: account.balance + amount, available: account.available + amount } : account));
        const stamp = new Date().toISOString();
        setTransactions((current) => [
          { id: `demo-out-${stamp}`, account_id: transferFrom, description: `Transfer to ${accounts.find((item) => item.id === transferTo)?.account_type}`, transaction_type: 'Transfer', amount: -amount, created_at: stamp, status: 'Completed' },
          { id: `demo-in-${stamp}`, account_id: transferTo, description: `Transfer from ${source?.account_type}`, transaction_type: 'Transfer', amount, created_at: stamp, status: 'Completed' },
          ...current,
        ]);
      }
      setTransferAmount(''); setTransferNote(''); setNotice(`Transfer of ${money(amount)} completed.`);
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function submitPayment() {
    const amount = Number(paymentAmount);
    if (!payee.trim()) { setNotice('Enter a payee name.'); return; }
    if (!validMoney(paymentAmount)) { setNotice('Enter an amount greater than $0 with up to two decimal places.'); return; }
    if (!validDate(paymentDate) || paymentDate < today) { setNotice('Enter a valid date today or later as YYYY-MM-DD.'); return; }
    setBusy(true); setNotice('');
    try {
      const payload = { account_id: selectedAccount === 'all' ? accounts[0]?.id : selectedAccount, recipient: payee.trim(), amount, next_payment_date: paymentDate, frequency: frequency.toLowerCase() };
      if (apiConfigured) { await bankingApi.createPayment(payload); await loadData(); }
      else setPayments((current) => [{ ...payload, id: `demo-${Date.now()}`, frequency, status: 'Scheduled' }, ...current]);
      setPayee(''); setPaymentAmount(''); setPaymentDate(''); setNotice('Your payment was scheduled.');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function cancelPayment(id) {
    setBusy(true); setNotice('');
    try {
      if (apiConfigured) { await bankingApi.cancelPayment(id); await loadData(); }
      else setPayments((current) => current.filter((item) => item.id !== id));
      setNotice('The scheduled payment was canceled.');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function createAccount() {
    const initialDeposit = Number(newAccountDeposit);
    if (!validMoney(newAccountDeposit, true)) { setNotice('Enter a valid initial deposit of $0 or more with up to two decimal places.'); return; }
    setBusy(true); setNotice('');
    try {
      if (apiConfigured) { await bankingApi.createAccount({ account_type: newAccountType.toLowerCase(), initial_deposit: initialDeposit }); await loadData(); }
      else {
        const id = `demo-account-${Date.now()}`;
        setAccounts((current) => [...current, { id, account_type: newAccountType, account_number: `•••• ${String(Date.now()).slice(-4)}`, balance: initialDeposit, available: initialDeposit, status: 'active' }]);
      }
      setShowCreateAccount(false); setNewAccountDeposit('0'); setNotice('Your account was created.');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function closeAccount(account) {
    if (Number(account.balance) !== 0) { setNotice('Transfer the remaining balance before closing this account.'); return; }
    if (transactions.some((item) => item.account_id === account.id && item.status?.toLowerCase() === 'pending')) { setNotice('This account has unresolved transactions.'); return; }
    setBusy(true); setNotice('');
    try {
      if (apiConfigured) { await bankingApi.closeAccount(account.id); await loadData(); }
      else setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, status: 'closed' } : item));
      setPendingCloseId(null);
      setNotice('The account was closed. Its history remains available.');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function findAtms() {
    if (!atmSearch.trim()) { setNotice('Enter a city, ZIP code, or address.'); return; }
    setBusy(true); setNotice('');
    try { if (apiConfigured) setAtms(unwrap(await bankingApi.atms(atmSearch.trim()), 'atms')); else setNotice('Showing sample ATM locations near San Francisco.'); }
    catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function saveProfile() {
    if (!profileDraft.first_name.trim() || !profileDraft.last_name.trim()) { setNotice('Enter your first and last name.'); return; }
    setBusy(true); setNotice('');
    try {
      if (apiConfigured) throw new Error('Profile updates need a dedicated backend profile endpoint.');
      setProfile((current) => ({ ...current, ...profileDraft }));
      setNotice('Your profile was updated.');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function markRead(item) {
    try {
      if (apiConfigured) await bankingApi.markNotificationRead(item.id);
      setNotifications((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
    } catch (error) { fail(error); }
  }

  async function openManager() {
    if (!isManager) return;
    navigate('manager');
    if (apiConfigured) {
      try {
        const [customers, managerAccounts, reports] = await Promise.all([bankingApi.managerCustomers(), bankingApi.managerAccounts(), bankingApi.managerReports()]);
        setManagerData({ customers: unwrap(customers, 'customers'), accounts: unwrap(managerAccounts, 'accounts'), reports: unwrap(reports, 'reports') });
      } catch (error) { fail(error); }
    }
  }

  const accountOptions = accounts.filter((item) => item.status !== 'closed').map((item) => ({ value: item.id, label: `${item.account_type} ${item.account_number}` }));

  function accountCard(account, index) {
    return <Card key={account.id} style={[styles.accountCard, compact && { width: '100%' }]}>
      <View style={styles.accountCardTop}><View style={[styles.accountIcon, index % 2 && { backgroundColor: '#E5F5EF' }]}><Icon name={index % 2 ? 'trending-up-outline' : 'wallet-outline'} size={23} color={index % 2 ? colors.green : colors.blue} /></View><Status>{account.status || 'Active'}</Status></View>
      <Text style={styles.accountName}>{account.account_type}</Text><Text style={styles.accountNumber}>{account.account_number}</Text>
      <Text style={styles.balanceLabel}>Available balance</Text><Text style={styles.balance}>{money(account.available ?? account.balance)}</Text>
      <Divider /><View style={styles.accountActions}><LinkButton onPress={() => { setSelectedAccount(account.id); navigate('activity'); }} icon="arrow-forward">View activity</LinkButton>{account.status !== 'closed' && <LinkButton onPress={() => { setTransferFrom(account.id); navigate('transfer'); }}>Transfer</LinkButton>}</View>
    </Card>;
  }

  function activityRows(rows) {
    return rows.length ? rows.map((item) => <View key={item.id} style={styles.transactionRow}>
      <View style={[styles.transactionIcon, item.amount >= 0 && { backgroundColor: '#E5F5EF' }]}><Icon name={item.amount >= 0 ? 'arrow-down-outline' : 'arrow-up-outline'} size={18} color={item.amount >= 0 ? colors.green : colors.blue} /></View>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.description}</Text><Text style={styles.rowSub}>{dateLabel(item.created_at)}  ·  {item.transaction_type}  ·  {item.status}</Text></View><Text style={[styles.transactionAmount, item.amount >= 0 && { color: colors.green }]}>{item.amount >= 0 ? '+' : '−'}{money(Math.abs(item.amount))}</Text>
    </View>) : <Text style={styles.emptyText}>No transactions match these filters.</Text>;
  }

  function overview() { return <>
    <View style={styles.hero}><View style={{ flex: 1 }}><Text style={styles.heroEyebrow}>GOOD TO SEE YOU</Text><Text style={styles.heroTitle}>Welcome back, {profile.first_name || 'there'}.</Text><Text style={styles.heroSubtitle}>Here’s a clear view of your money today.</Text></View><View style={styles.heroDecoration}><Icon name="shield-checkmark-outline" size={42} color="#B9DBF7" /></View></View>
    <Notice text={notice} kind={notice.includes('completed') || notice.includes('scheduled') ? 'success' : 'error'} />
    <View style={[styles.summaryRow, compact && styles.stack]}><Card style={[styles.summaryCard, compact && styles.fullWidth]}><Text style={styles.miniLabel}>TOTAL BALANCE</Text><Text style={styles.summaryAmount}>{money(total)}</Text><Text style={styles.summaryCaption}>Across {accounts.length} accounts</Text></Card><Card style={[styles.summaryCard, compact && styles.fullWidth]}><Text style={styles.miniLabel}>UPCOMING PAYMENTS</Text><Text style={styles.summaryAmount}>{payments.length}</Text><Text style={styles.summaryCaption}>Scheduled and ready</Text></Card></View>
    <SectionHeading title="Your accounts" subtitle="Everything in one place" action="See all accounts" onAction={() => navigate('accounts')} />
    <View style={[styles.accountsGrid, compact && styles.stack]}>{accounts.map(accountCard)}</View>
    <View style={[styles.twoColumns, compact && styles.stack]}><Card style={styles.columnCard}><SectionHeading title="Quick actions" /><View style={styles.quickGrid}>{[
      ['Move money', 'swap-horizontal-outline', 'transfer'], ['Pay a bill', 'receipt-outline', 'payments'], ['Find an ATM', 'location-outline', 'atms'], ['View activity', 'list-outline', 'activity'],
    ].map(([label, icon, target]) => <Pressable key={label} onPress={() => navigate(target)} style={styles.quickAction}><View style={styles.quickIcon}><Icon name={icon} size={22} /></View><Text style={styles.quickLabel}>{label}</Text></Pressable>)}</View></Card>
      <Card style={styles.columnCard}><SectionHeading title="Recent activity" action="View all" onAction={() => navigate('activity')} />{activityRows(transactions.slice(0, 3))}</Card></View>
  </>; }

  function accountsPage() { return <><SectionHeading title="Accounts" subtitle="Choose an account to see its balance and activity." action={showCreateAccount ? 'Hide form' : 'Open an account'} onAction={() => setShowCreateAccount((value) => !value)} /><Notice text={notice} kind={notice.includes('created') || notice.includes('closed') ? 'success' : 'error'} />{showCreateAccount && <Card style={{ marginBottom: 18 }}><Text style={styles.cardTitle}>Open an account</Text><Choice label="Account type" value={newAccountType} options={[{ label: 'Checking', value: 'Checking' }, { label: 'Savings', value: 'Savings' }]} onChange={setNewAccountType} /><Field label="Initial deposit" value={newAccountDeposit} onChangeText={setNewAccountDeposit} keyboardType="decimal-pad" placeholder="0.00" /><Action onPress={createAccount} disabled={busy}>Create account</Action></Card>}<View style={[styles.accountsGrid, compact && styles.stack]}>{accounts.map(accountCard)}</View><Card style={styles.infoCard}><Icon name="lock-closed-outline" size={22} /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Account services</Text><Text style={styles.rowSub}>An account must have a zero balance and no unresolved transactions before it can be closed.</Text></View></Card>{accounts.filter((item) => item.status !== 'closed').map((account) => <View key={`close-${account.id}`} style={styles.accountServiceRow}><Text style={styles.rowSub}>{account.account_type} {account.account_number}</Text>{pendingCloseId === account.id ? <View style={styles.accountServiceActions}><Text style={styles.rowSub}>Close this account?</Text><LinkButton onPress={() => closeAccount(account)}>Confirm close</LinkButton><LinkButton onPress={() => setPendingCloseId(null)}>Keep account</LinkButton></View> : <LinkButton onPress={() => setPendingCloseId(account.id)}>Close account</LinkButton>}</View>)}</>; }

  function transferPage() { return <><SectionHeading title="Transfer money" subtitle="Move money between your accounts." /><Notice text={notice} kind={notice.includes('completed') ? 'success' : 'error'} /><View style={[styles.twoColumns, compact && styles.stack]}><Card style={styles.formCard}>
    <Text style={styles.cardTitle}>Transfer details</Text><Choice label="From" value={transferFrom} options={accountOptions} onChange={setTransferFrom} /><Choice label="To" value={transferTo} options={accountOptions} onChange={setTransferTo} /><Field label="Amount" value={transferAmount} onChangeText={setTransferAmount} keyboardType="decimal-pad" placeholder="0.00" /><Field label="Memo (optional)" value={transferNote} onChangeText={setTransferNote} placeholder="What is this for?" /><Action onPress={submitTransfer} disabled={busy} icon="arrow-forward-outline">{busy ? 'Working…' : 'Transfer money'}</Action>
  </Card><Card style={styles.asideCard}><Icon name="information-circle-outline" size={26} /><Text style={styles.cardTitle}>Before you transfer</Text><Text style={styles.bodyText}>Transfers between your own accounts update both balances together. Check the amount and destination before submitting.</Text><Divider /><Text style={styles.rowSub}>Available in {accounts.find((item) => item.id === transferFrom)?.account_type || 'selected account'}</Text><Text style={styles.asideAmount}>{money(accounts.find((item) => item.id === transferFrom)?.available ?? 0)}</Text></Card></View></>; }

  function paymentsPage() { return <><SectionHeading title="Bill payments" subtitle="Schedule a payment and keep track of what’s next." /><Notice text={notice} kind={notice.includes('scheduled') || notice.includes('canceled') ? 'success' : 'error'} /><View style={[styles.twoColumns, compact && styles.stack]}><Card style={styles.formCard}><Text style={styles.cardTitle}>Schedule a payment</Text><Field label="Payee" value={payee} onChangeText={setPayee} placeholder="Business or person" /><Choice label="Pay from" value={selectedAccount === 'all' ? accounts[0]?.id : selectedAccount} options={accountOptions} onChange={setSelectedAccount} /><Field label="Amount" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="0.00" /><Field label="Payment date" value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" accessibilityHint="Enter a date in year-month-day format" /><Choice label="Repeat" value={frequency} options={['Once', 'Weekly', 'Monthly'].map((value) => ({ label: value, value }))} onChange={setFrequency} /><Action onPress={submitPayment} disabled={busy} icon="calendar-outline">{busy ? 'Working…' : 'Schedule payment'}</Action></Card>
    <Card style={styles.columnCard}><Text style={styles.cardTitle}>Upcoming payments</Text>{payments.length ? payments.map((payment) => <View key={payment.id} style={styles.paymentRow}><View style={styles.paymentIcon}><Icon name="receipt-outline" size={19} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{payment.recipient}</Text><Text style={styles.rowSub}>{dateLabel(payment.next_payment_date)} · {payment.frequency}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.transactionAmount}>{money(payment.amount)}</Text><LinkButton onPress={() => cancelPayment(payment.id)}>Cancel</LinkButton></View></View>) : <Text style={styles.emptyText}>No payments scheduled.</Text>}</Card></View></>; }

  function activityPage() { return <><SectionHeading title="Transaction history" subtitle="Search and filter the activity on your accounts." /><Notice text={notice} kind="error" /><Card><View style={[styles.filterGrid, compact && styles.stack]}><View style={styles.filterCell}><Choice label="Account" value={selectedAccount} options={[{ label: 'All accounts', value: 'all' }, ...accountOptions]} onChange={setSelectedAccount} /></View><View style={styles.filterCell}><Field label="Search" value={transactionSearch} onChangeText={setTransactionSearch} placeholder="Merchant or description" /></View><View style={styles.filterCell}><Choice label="Type" value={transactionType} options={['All', 'Deposit', 'Transfer', 'Bill payment', 'Card purchase'].map((value) => ({ label: value, value }))} onChange={setTransactionType} /></View></View><View style={[styles.filterGrid, compact && styles.stack]}><View style={styles.filterCell}><Field label="From date" value={transactionStart} onChangeText={setTransactionStart} placeholder="YYYY-MM-DD" /></View><View style={styles.filterCell}><Field label="To date" value={transactionEnd} onChangeText={setTransactionEnd} placeholder="YYYY-MM-DD" /></View></View><Divider />{activityRows(visibleTransactions)}</Card></>; }

  function atmPage() { return <><SectionHeading title="Find an ATM" subtitle="Search by city, ZIP code, or street address." /><Notice text={notice} kind={notice.includes('sample') ? 'info' : 'error'} /><Card><View style={[styles.searchRow, compact && styles.stack]}><View style={{ flex: 1 }}><Field label="Location" value={atmSearch} onChangeText={setAtmSearch} placeholder="City, ZIP, or address" /></View><Action onPress={findAtms} disabled={busy} icon="search-outline" style={{ marginTop: compact ? 0 : 23 }}>{busy ? 'Searching…' : 'Search ATMs'}</Action></View><Divider />{atms.length ? atms.map((atm) => <View key={atm.id} style={styles.atmRow}><View style={styles.atmIcon}><Icon name="location-outline" size={22} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{atm.name}</Text><Text style={styles.rowSub}>{atm.address}</Text><Text style={[styles.rowSub, { color: colors.green }]}>{atm.hours}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.distance}>{atm.distance || 'Nearby'}</Text><LinkButton onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(atm.address)}`)} icon="open-outline">Directions</LinkButton></View></View>) : <Text style={styles.emptyText}>No ATMs found for this location.</Text>}</Card></>; }

  function checksPage() { return <><SectionHeading title="Deposit checks" subtitle="Check deposit is available in the mobile app." /><Card style={styles.infoCard}><Icon name="phone-portrait-outline" size={27} /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Use your phone to deposit a check</Text><Text style={styles.bodyText}>The project design reserves image capture and check processing for mobile. Sign in to the mobile app, photograph the front and back of the check, and follow the review steps there.</Text></View></Card></>; }

  function profilePage() { return <><SectionHeading title="Profile & settings" subtitle="Keep your contact information up to date." /><Notice text={notice} kind={notice.includes('updated') ? 'success' : 'error'} /><View style={[styles.twoColumns, compact && styles.stack]}><Card style={styles.formCard}><Text style={styles.cardTitle}>Personal details</Text><Field label="First name" value={profileDraft.first_name} onChangeText={(value) => setProfileDraft((current) => ({ ...current, first_name: value }))} /><Field label="Last name" value={profileDraft.last_name} onChangeText={(value) => setProfileDraft((current) => ({ ...current, last_name: value }))} /><Field label="Phone number" value={profileDraft.phone} onChangeText={(value) => setProfileDraft((current) => ({ ...current, phone: value }))} keyboardType="phone-pad" /><View style={styles.field}><Text style={styles.fieldLabel}>Email address</Text><Text style={styles.readOnly}>{profile.email}</Text></View><Action onPress={saveProfile} disabled={busy || apiConfigured}>Save changes</Action>{apiConfigured && <Text style={styles.rowSub}>Profile editing will be enabled when the backend adds a profile update endpoint.</Text>}{!apiConfigured && <LinkButton onPress={() => { setProfile((current) => ({ ...current, role: current.role === 'manager' ? 'customer' : 'manager' })); setNotice('Demo role changed.'); }}>Preview {isManager ? 'customer' : 'manager'} view</LinkButton>}</Card><Card style={styles.asideCard}><Icon name="shield-checkmark-outline" size={27} /><Text style={styles.cardTitle}>Account security</Text><Text style={styles.bodyText}>Protect your account with a strong password and multi factor authentication. Contact your banking team if you notice unfamiliar activity.</Text><Divider /><Text style={styles.rowSub}>Signed in as</Text><Text style={styles.rowTitle}>{profile.email}</Text></Card></View></>; }

  function managerPage() {
    if (!isManager) return <><SectionHeading title="Access denied" subtitle="This page is available to authorized staff only." /></>;
    const query = managerSearch.toLowerCase();
    const customers = managerData.customers.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
    const managedAccounts = managerData.accounts.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
    const reportAccounts = managerData.accounts.filter((item) => managerReportFilter === 'All' || item.status?.toLowerCase() === managerReportFilter.toLowerCase());
    return <><SectionHeading title="Manager dashboard" subtitle="Authorized staff view" /><Notice text={notice} kind="error" /><View style={[styles.summaryRow, compact && styles.stack]}><Card style={styles.summaryCard}><Text style={styles.miniLabel}>CUSTOMERS</Text><Text style={styles.summaryAmount}>{managerData.customers.length}</Text></Card><Card style={styles.summaryCard}><Text style={styles.miniLabel}>ACCOUNTS</Text><Text style={styles.summaryAmount}>{managerData.accounts.length}</Text></Card></View><Card><Field label="Search customers and accounts" value={managerSearch} onChangeText={setManagerSearch} placeholder="Name, customer ID, or account ID" /><Divider /><Text style={styles.cardTitle}>Customers</Text>{customers.length ? customers.map((item, index) => <View style={styles.simpleRow} key={item.id || index}><Text style={styles.rowTitle}>{item.first_name} {item.last_name}</Text><Text style={styles.rowSub}>{item.id}</Text></View>) : <Text style={styles.emptyText}>No matching customers.</Text>}<Divider /><Text style={styles.cardTitle}>Accounts</Text>{managedAccounts.length ? managedAccounts.map((item, index) => <View style={styles.simpleRow} key={item.id || index}><Text style={styles.rowTitle}>{item.account_type} · {item.account_number || item.id}</Text><Text style={styles.rowSub}>{money(item.balance || 0)} · {item.status}</Text></View>) : <Text style={styles.emptyText}>No matching accounts.</Text>}<Divider /><Text style={styles.cardTitle}>Reports</Text><Choice label="Account status" value={managerReportFilter} options={['All', 'Active', 'Closed'].map((value) => ({ label: value, value }))} onChange={(value) => { setManagerReportFilter(value); setShowManagerReport(false); }} /><Action variant="secondary" onPress={() => setShowManagerReport(true)}>Generate summary</Action>{showManagerReport && <View style={styles.reportSummary}><Text style={styles.rowTitle}>{managerReportFilter} accounts: {reportAccounts.length}</Text><Text style={styles.rowSub}>Combined balance: {money(reportAccounts.reduce((sum, item) => sum + Number(item.balance || 0), 0))}</Text></View>}{managerData.reports.length ? managerData.reports.map((item, index) => <View key={item.id || index} style={styles.simpleRow}><Text style={styles.rowTitle}>{item.title || item.name || `Report ${index + 1}`}</Text><Text style={styles.rowSub}>{item.summary || item.description || 'Report available'}</Text></View>) : <Text style={styles.emptyText}>No saved reports available.</Text>}</Card></>;
  }

  const pages = { overview, accounts: accountsPage, transfer: transferPage, payments: paymentsPage, activity: activityPage, checks: checksPage, atms: atmPage, profile: profilePage, manager: managerPage };

  if (!signedIn) return <View style={styles.loginShell}><View style={styles.loginTop}><View style={styles.brandMark}><Icon name="shield-checkmark" size={23} color={colors.white} /></View><Text style={styles.brandName}>CS160 Bank</Text></View><View style={styles.loginBody}><View style={[styles.loginIntro, compact && { paddingRight: 0 }]}><Text style={styles.loginEyebrow}>BANKING MADE CLEAR</Text><Text style={styles.loginHeadline}>A better view of your everyday banking.</Text><Text style={styles.loginDescription}>Balances, transfers, payments and activity, all in one simple place.</Text><View style={styles.loginBenefits}><Text style={styles.benefit}>✓  See every account at a glance</Text><Text style={styles.benefit}>✓  Move money with confidence</Text><Text style={styles.benefit}>✓  Stay on top of upcoming bills</Text></View></View><Card style={styles.loginCard}><Text style={styles.loginCardTitle}>{authView === 'mfa' ? 'Verify your sign in' : authView === 'forgot' ? 'Reset your password' : 'Welcome back'}</Text><Text style={styles.loginCardSubtitle}>{authView === 'mfa' ? 'Enter the verification code sent to you.' : authView === 'forgot' ? 'We’ll send a recovery link if this email is registered.' : 'Sign in to your account'}</Text><Notice text={notice} kind={notice.includes('sent') ? 'success' : 'error'} />{!apiConfigured && authView === 'login' ? <><Notice text="UI demo: sample data only. No real banking transactions are performed." /><Action onPress={signIn} icon="arrow-forward-outline">Open demo dashboard</Action></> : <>{authView === 'mfa' ? <Field label="Verification code" value={mfaCode} onChangeText={setMfaCode} keyboardType="number-pad" placeholder="Enter code" /> : <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />}{authView === 'login' && <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Enter password" /> }<Action onPress={authView === 'mfa' ? verifyMfa : authView === 'forgot' ? resetPassword : signIn} disabled={busy}>{busy ? 'Please wait…' : authView === 'mfa' ? 'Verify code' : authView === 'forgot' ? 'Send reset link' : 'Sign in'}</Action>{authView === 'login' ? <LinkButton onPress={() => { setAuthView('forgot'); setNotice(''); }}>Forgot password?</LinkButton> : <LinkButton onPress={() => { setAuthView('login'); setNotice(''); }}>Back to sign in</LinkButton>}</>}</Card></View><Text style={styles.loginFooter}>CS160 Bank · Class project interface</Text></View>;

  return <View style={styles.appShell}><View style={styles.header}><Pressable onPress={() => navigate('overview')} style={styles.brand}><View style={styles.brandMark}><Icon name="shield-checkmark" size={20} color={colors.white} /></View><Text style={styles.brandName}>CS160 Bank</Text></Pressable><View style={styles.headerRight}><Text style={[styles.headerGreeting, compact && { display: 'none' }]}>Hello, {profile.first_name}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} onPress={() => setShowNotifications((value) => !value)} style={styles.headerIcon}><Icon name="notifications-outline" size={22} color={colors.ink} />{unread > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unread}</Text></View>}</Pressable><Pressable accessibilityRole="button" accessibilityLabel="Profile and settings" onPress={() => navigate('profile')} style={styles.avatar}><Text style={styles.avatarText}>{(profile.first_name || 'U')[0]}</Text></Pressable><LinkButton onPress={signOut}>Sign out</LinkButton></View></View>
    {!apiConfigured && <View style={styles.demoBar}><Icon name="information-circle-outline" size={16} color="#6B5600" /><Text style={styles.demoText}>Demo mode — sample information; actions are local to this browser session.</Text></View>}
    <View style={styles.appBody}>{!compact && <View style={styles.sidebar}><Text style={styles.sidebarLabel}>BANKING</Text>{NAV.map(([id, label, icon]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: page === id }} onPress={() => navigate(id)} style={[styles.navItem, page === id && styles.navItemActive]}><Icon name={icon} size={20} color={page === id ? colors.blue : colors.muted} /><Text style={[styles.navText, page === id && styles.navTextActive]}>{label}</Text></Pressable>)}{isManager && <><Text style={[styles.sidebarLabel, { marginTop: 28 }]}>STAFF</Text><Pressable onPress={openManager} style={[styles.navItem, page === 'manager' && styles.navItemActive]}><Icon name="briefcase-outline" size={20} /><Text style={styles.navText}>Manager dashboard</Text></Pressable></>}<View style={styles.sidebarBottom}><Icon name="help-circle-outline" size={20} color={colors.muted} /><Text style={styles.sidebarBottomText}>Need help? Contact support.</Text></View></View>}
      <View style={styles.mainColumn}>{compact && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileNav} contentContainerStyle={styles.mobileNavContent}>{NAV.map(([id, label]) => <Pressable key={id} accessibilityRole="button" onPress={() => navigate(id)} style={[styles.mobileNavItem, page === id && styles.mobileNavActive]}><Text style={[styles.mobileNavText, page === id && { color: colors.blue }]}>{label}</Text></Pressable>)}{isManager && <Pressable accessibilityRole="button" onPress={openManager} style={[styles.mobileNavItem, page === 'manager' && styles.mobileNavActive]}><Text style={[styles.mobileNavText, page === 'manager' && { color: colors.blue }]}>Manager</Text></Pressable>}</ScrollView>}<ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{pages[page]?.()}</ScrollView></View>
      {showNotifications && <View style={[styles.notificationPanel, compact && styles.notificationPanelMobile]}><View style={styles.notificationHeading}><Text style={styles.cardTitle}>Notifications</Text><Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setShowNotifications(false)}><Icon name="close-outline" size={24} color={colors.ink} /></Pressable></View>{notifications.length ? notifications.map((item) => <Pressable key={item.id} onPress={() => markRead(item)} style={[styles.notificationItem, !item.read && { backgroundColor: '#F1F7FD' }]}><Text style={styles.rowTitle}>{item.notification_type}</Text><Text style={styles.rowSub}>{item.message}</Text><Text style={styles.notificationDate}>{dateLabel(item.created_at)}</Text></Pressable>) : <Text style={styles.emptyText}>No notifications yet.</Text>}</View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  appShell: { flex: 1, backgroundColor: colors.canvas, minHeight: '100%' },
  header: { height: 72, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 3 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { width: 35, height: 35, borderRadius: 9, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, brandName: { fontSize: 20, fontWeight: '800', color: colors.navy, letterSpacing: -.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 20 }, headerGreeting: { color: colors.muted, fontSize: 14 }, headerIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, notificationBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.red, minWidth: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, notificationBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' }, avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.blue, fontWeight: '800' },
  demoBar: { minHeight: 34, backgroundColor: '#FFF4CF', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28 }, demoText: { color: '#6B5600', fontSize: 12, fontWeight: '600' }, appBody: { flex: 1, flexDirection: 'row', position: 'relative' }, sidebar: { width: 232, backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border, paddingTop: 26, paddingHorizontal: 14 }, sidebarLabel: { color: '#8B9CAA', fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginHorizontal: 14, marginBottom: 14 }, navItem: { height: 44, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, marginBottom: 3 }, navItemActive: { backgroundColor: colors.sky }, navText: { color: colors.muted, fontSize: 14, fontWeight: '600' }, navTextActive: { color: colors.blue, fontWeight: '800' }, sidebarBottom: { marginTop: 'auto', paddingVertical: 24, paddingHorizontal: 10, flexDirection: 'row', gap: 9, alignItems: 'center' }, sidebarBottomText: { color: colors.muted, fontSize: 11 }, mainColumn: { flex: 1, minWidth: 0 }, content: { padding: 32, paddingBottom: 80, maxWidth: 1340, width: '100%', alignSelf: 'center' }, mobileNav: { height: 48, flexGrow: 0, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border }, mobileNavContent: { paddingHorizontal: 13, gap: 4, alignItems: 'center' }, mobileNavItem: { paddingHorizontal: 12, height: 46, justifyContent: 'center' }, mobileNavActive: { borderBottomWidth: 2, borderBottomColor: colors.blue }, mobileNavText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  hero: { borderRadius: 12, backgroundColor: colors.navy, minHeight: 180, padding: 32, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: 22 }, heroEyebrow: { color: '#AED5F4', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10 }, heroTitle: { color: colors.white, fontSize: 31, fontWeight: '800', letterSpacing: -.6, marginBottom: 7 }, heroSubtitle: { color: '#D0E6F7', fontSize: 15 }, heroDecoration: { width: 116, height: 116, borderRadius: 58, borderWidth: 20, borderColor: '#16547F', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 11, padding: 22, ...Platform.select({ web: { boxShadow: '0 2px 8px rgba(10,43,70,.04)' }, default: {} }) }, divider: { height: 1, backgroundColor: colors.border, marginVertical: 18 }, sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, marginBottom: 16 }, sectionTitle: { color: colors.ink, fontSize: 22, fontWeight: '800', letterSpacing: -.3 }, subtitle: { color: colors.muted, fontSize: 14, marginTop: 4 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 18 },
  summaryRow: { flexDirection: 'row', gap: 16, marginBottom: 16 }, summaryCard: { flex: 1, minHeight: 128 }, miniLabel: { color: colors.muted, fontSize: 11, letterSpacing: 1.2, fontWeight: '800', marginBottom: 10 }, summaryAmount: { color: colors.ink, fontSize: 29, fontWeight: '800' }, summaryCaption: { color: colors.muted, fontSize: 12, marginTop: 4 }, accountsGrid: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginBottom: 20 }, accountCard: { flex: 1, minWidth: 260 }, accountCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, accountIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, accountName: { color: colors.ink, fontSize: 18, fontWeight: '800' }, accountNumber: { color: colors.muted, fontSize: 13, marginTop: 3 }, balanceLabel: { color: colors.muted, fontSize: 12, marginTop: 22 }, balance: { color: colors.ink, fontSize: 26, fontWeight: '800', marginTop: 3 }, accountActions: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, status: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 }, statusDot: { width: 6, height: 6, borderRadius: 3 }, statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  twoColumns: { flexDirection: 'row', gap: 16, alignItems: 'flex-start', marginTop: 4 }, columnCard: { flex: 1, minWidth: 0 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, quickAction: { width: '47%', minHeight: 82, borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 }, quickIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, quickLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', flexShrink: 1 }, transactionRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12 }, transactionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, rowTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' }, rowSub: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 }, transactionAmount: { color: colors.ink, fontSize: 14, fontWeight: '800', marginLeft: 8 },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5 }, linkText: { color: colors.blue, fontSize: 13, fontWeight: '800' }, action: { minHeight: 45, borderRadius: 7, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, alignSelf: 'flex-start' }, actionPrimary: { backgroundColor: colors.blue }, actionSecondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.blue }, actionText: { fontSize: 14, fontWeight: '800' }, disabled: { opacity: .55 }, pressed: { opacity: .75 }, field: { marginBottom: 19 }, fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 7 }, input: { height: 46, borderWidth: 1, borderColor: '#B9C8D3', borderRadius: 6, paddingHorizontal: 13, fontSize: 15, color: colors.ink, backgroundColor: colors.white, outlineStyle: 'none' }, readOnly: { backgroundColor: colors.canvas, padding: 14, borderRadius: 6, color: colors.muted }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { borderWidth: 1, borderColor: '#B9C8D3', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, minHeight: 42, justifyContent: 'center' }, choiceActive: { backgroundColor: colors.sky, borderColor: colors.blue }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, choiceTextActive: { color: colors.blue }, formCard: { flex: 1.3, minWidth: 0 }, asideCard: { flex: 1, minWidth: 0, backgroundColor: '#F0F7FC' }, asideAmount: { color: colors.ink, fontSize: 22, fontWeight: '800', marginTop: 5 }, bodyText: { color: colors.muted, fontSize: 14, lineHeight: 22 }, notice: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#EAF4FC', borderRadius: 7, padding: 12, marginBottom: 16 }, noticeError: { backgroundColor: '#FCEDEE' }, noticeSuccess: { backgroundColor: '#E8F6EF' }, noticeText: { color: colors.ink, fontSize: 13, flex: 1, lineHeight: 18 }, emptyText: { color: colors.muted, fontSize: 13, paddingVertical: 20 }, infoCard: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#F0F7FC' },
  paymentRow: { flexDirection: 'row', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border }, paymentIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, filterCell: { flex: 1, minWidth: 180 }, searchRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' }, atmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }, atmIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sky, alignItems: 'center', justifyContent: 'center' }, distance: { color: colors.ink, fontSize: 12, fontWeight: '800' }, simpleRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, accountServiceRow: { paddingHorizontal: 8, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, accountServiceActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, reportSummary: { backgroundColor: colors.sky, padding: 14, borderRadius: 7, marginTop: 15 },
  notificationPanel: { position: 'absolute', top: 0, right: 12, width: 340, maxHeight: 450, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 10, zIndex: 5, ...Platform.select({ web: { boxShadow: '0 12px 30px rgba(10,43,70,.16)' }, default: {} }) }, notificationPanelMobile: { right: 4, left: 4, width: 'auto' }, notificationHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }, notificationItem: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border }, notificationDate: { color: colors.muted, fontSize: 11, marginTop: 5 },
  loginShell: { flex: 1, minHeight: '100%', backgroundColor: '#F4F8FB' }, loginTop: { height: 76, backgroundColor: colors.white, paddingHorizontal: 46, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, loginBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', padding: 28, gap: 52 }, loginIntro: { width: 450, maxWidth: '100%', paddingRight: 10 }, loginEyebrow: { color: colors.blue, fontSize: 12, fontWeight: '800', letterSpacing: 1.8, marginBottom: 15 }, loginHeadline: { color: colors.navy, fontSize: 43, fontWeight: '800', letterSpacing: -1.1, lineHeight: 49 }, loginDescription: { color: colors.muted, fontSize: 17, lineHeight: 26, marginTop: 20 }, loginBenefits: { marginTop: 28, gap: 12 }, benefit: { color: colors.ink, fontSize: 14, fontWeight: '600' }, loginCard: { width: 400, maxWidth: '100%', padding: 30 }, loginCardTitle: { color: colors.ink, fontSize: 26, fontWeight: '800' }, loginCardSubtitle: { color: colors.muted, fontSize: 14, marginTop: 7, marginBottom: 24 }, loginFooter: { textAlign: 'center', color: colors.muted, fontSize: 12, paddingBottom: 22 }, stack: { flexDirection: 'column' }, fullWidth: { width: '100%' },
});
