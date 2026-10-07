import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { apiConfigured, bankingApi, clearSession, setSession, storedRefreshToken } from '../services/api';
import { demoAccounts, demoAtms, demoManagerData, demoNotifications, demoPayments, demoProfile, demoTransactions } from '../data/demo';
import { isActivated, money, titleCase } from '../theme';

const isWeb = Platform.OS === 'web';
const now = new Date();
const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const unwrap = (value, key) => Array.isArray(value) ? value : value?.[key] || [];
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validMoney = (value, allowZero = false) => /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && (allowZero ? Number(value) >= 0 : Number(value) > 0);
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

const AppContext = createContext(null);

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}

export function AppProvider({ children }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const [signedIn, setSignedIn] = useState(false);
  const [authView, setAuthView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [registerDraft, setRegisterDraft] = useState({ first_name: '', last_name: '', phone: '', confirm: '' });
  const [restoring, setRestoring] = useState(apiConfigured);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState(apiConfigured ? {} : demoProfile);
  const [accounts, setAccounts] = useState(apiConfigured ? [] : demoAccounts);
  const [transactions, setTransactions] = useState(apiConfigured ? [] : demoTransactions);
  const [payments, setPayments] = useState(apiConfigured ? [] : demoPayments);
  const [notifications, setNotifications] = useState(apiConfigured ? [] : demoNotifications);
  const [selectedAccount, setSelectedAccount] = useState('checking');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [newAccountType, setNewAccountType] = useState('checking');
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
  const isManager = profile.role === 'manager' || profile.role === 'employee' || profile.role === 'admin';
  const total = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const visibleTransactions = useMemo(() => transactions.filter((item) => {
    const matchAccount = selectedAccount === 'all' || item.account_id === selectedAccount;
    const matchQuery = item.description.toLowerCase().includes(transactionSearch.toLowerCase());
    const matchType = transactionType === 'All' || item.transaction_type === transactionType;
    const matchStart = !transactionStart || item.created_at.slice(0, 10) >= transactionStart;
    const matchEnd = !transactionEnd || item.created_at.slice(0, 10) <= transactionEnd;
    return matchAccount && matchQuery && matchType && matchStart && matchEnd;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at)), [transactions, selectedAccount, transactionSearch, transactionType, transactionStart, transactionEnd]);

  function navigate(path) {
    setNotice(''); setShowNotifications(false);
    router.push(path);
    if (isWeb) window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  function fail(error) { setNotice(error?.message || 'Something went wrong. Please try again.'); }

  async function loadData() {
    if (!apiConfigured) return;
    // Banking endpoints are optional while the backend is built out; a missing one must not block sign-in.
    const optional = (request) => request.catch(() => []);
    const [me, accountResult, paymentResult, notificationResult] = await Promise.all([
      bankingApi.me(), optional(bankingApi.accounts()), optional(bankingApi.payments()), optional(bankingApi.notifications()),
    ]);
    const nextProfile = me.profile || me;
    const nextAccounts = unwrap(accountResult, 'accounts');
    const lists = await Promise.all(nextAccounts.map((account) => optional(bankingApi.transactions(account.id))));
    setProfile(nextProfile);
    setProfileDraft({ first_name: nextProfile.first_name || '', last_name: nextProfile.last_name || '', phone: nextProfile.phone || '' });
    setAccounts(nextAccounts);
    const activeAccounts = nextAccounts.filter(isActivated);
    setSelectedAccount(nextAccounts[0]?.id || 'all');
    setTransferFrom(activeAccounts[0]?.id || '');
    setTransferTo(activeAccounts[1]?.id || '');
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
      else { await startSession(result); }
    } catch (error) { clearSession(); fail(error); }
    finally { setBusy(false); }
  }

  async function startSession(result) {
    setSession(result);
    await loadData();
    setPassword(''); setRegisterDraft((current) => ({ ...current, confirm: '' }));
    setSignedIn(true);
  }

  async function register() {
    const { first_name, last_name, phone, confirm } = registerDraft;
    if (!first_name.trim() || !last_name.trim()) { setNotice('Enter your first and last name.'); return; }
    if (!validEmail(email.trim())) { setNotice('Enter a valid email address.'); return; }
    if (phone.trim() && !/^\+?[0-9 ()-]{7,20}$/.test(phone.trim())) { setNotice('Enter a valid phone number.'); return; }
    if (password.length < 8) { setNotice('Your password must be at least 8 characters.'); return; }
    if (password !== confirm) { setNotice('The passwords do not match.'); return; }
    if (!apiConfigured) { setSignedIn(true); return; }
    setBusy(true); setNotice('');
    try {
      const result = await bankingApi.register({ first_name: first_name.trim(), last_name: last_name.trim(), email: email.trim(), phone: phone.trim() || null, password });
      await startSession(result);
    } catch (error) { clearSession(); fail(error); }
    finally { setBusy(false); }
  }

  // Restore a saved web session on first load: try the refresh token, otherwise show the login screen.
  useEffect(() => {
    const token = apiConfigured ? storedRefreshToken() : null;
    if (!token) { setRestoring(false); return; }
    bankingApi.refresh(token)
      .then(startSession)
      .catch(() => clearSession())
      .finally(() => setRestoring(false));
  }, []);

  async function verifyMfa() {
    if (!mfaCode.trim()) { setNotice('Enter your verification code.'); return; }
    setBusy(true); setNotice('');
    try {
      const result = await bankingApi.verifyMfa(mfaCode.trim());
      await startSession(result);
    } catch (error) { clearSession(); fail(error); }
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
    clearSession(); setSignedIn(false); setPassword(''); setMfaCode(''); setAuthView('login'); setNotice('');
    setProfile(apiConfigured ? {} : demoProfile); setAccounts(apiConfigured ? [] : demoAccounts); setTransactions(apiConfigured ? [] : demoTransactions);
    router.replace('/');
  }

  async function submitTransfer() {
    const amount = Number(transferAmount);
    if (!transferFrom || !transferTo || transferFrom === transferTo) { setNotice('Choose two different accounts.'); return; }
    if (!validMoney(transferAmount)) { setNotice('Enter an amount greater than $0 with up to two decimal places.'); return; }
    const source = accounts.find((item) => item.id === transferFrom);
    if (source && amount > Number(source.balance)) { setNotice('The source account has insufficient funds.'); return; }
    setBusy(true); setNotice('');
    try {
      if (apiConfigured) {
        await bankingApi.transfer({ source_account_id: transferFrom, destination_account_id: transferTo, amount, transfer_type: 'internal', description: transferNote });
        await loadData();
      } else {
        setAccounts((current) => current.map((account) => account.id === transferFrom ? { ...account, balance: account.balance - amount } : account.id === transferTo ? { ...account, balance: account.balance + amount } : account));
        const stamp = new Date().toISOString();
        setTransactions((current) => [
          { id: `demo-out-${stamp}`, account_id: transferFrom, description: `Transfer to ${titleCase(accounts.find((item) => item.id === transferTo)?.account_type)}`, transaction_type: 'Transfer', amount: -amount, created_at: stamp, status: 'Completed' },
          { id: `demo-in-${stamp}`, account_id: transferTo, description: `Transfer from ${titleCase(source?.account_type)}`, transaction_type: 'Transfer', amount, created_at: stamp, status: 'Completed' },
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
    setBusy(true); setNotice('');
    try {
      if (apiConfigured) { await bankingApi.createAccount({ account_type: newAccountType }); await loadData(); }
      else {
        const id = `demo-account-${Date.now()}`;
        setAccounts((current) => [...current, { id, account_type: newAccountType, account_number: `•••• ${String(Date.now()).slice(-4)}`, balance: 0, status: 'activated' }]);
      }
      setShowCreateAccount(false); setNotice('Your account was created.');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }

  async function closeAccount(account) {
    if (Number(account.balance) !== 0) { setNotice('Transfer the remaining balance before closing this account.'); return; }
    if (transactions.some((item) => item.account_id === account.id && item.status?.toLowerCase() === 'pending')) { setNotice('This account has unresolved transactions.'); return; }
    setBusy(true); setNotice('');
    try {
      if (apiConfigured) { await bankingApi.closeAccount(account.id); await loadData(); }
      else setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, status: 'deactivated', closed_at: new Date().toISOString() } : item));
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
    navigate('/manager');
    if (apiConfigured) {
      try {
        const [customers, managerAccounts, reports] = await Promise.all([bankingApi.managerCustomers(), bankingApi.managerAccounts(), bankingApi.managerReports()]);
        setManagerData({ customers: unwrap(customers, 'customers'), accounts: unwrap(managerAccounts, 'accounts'), reports: unwrap(reports, 'reports') });
      } catch (error) { fail(error); }
    }
  }

  const accountOptions = accounts.filter(isActivated).map((item) => ({ value: item.id, label: `${titleCase(item.account_type)} ${item.account_number}` }));

  const value = {
    compact, signedIn, setSignedIn, restoring, registerDraft, setRegisterDraft, register, authView, setAuthView, email, setEmail, password, setPassword, mfaCode, setMfaCode,
    busy, notice, setNotice, profile, setProfile, accounts, setAccounts, transactions, setTransactions, payments, setPayments,
    notifications, setNotifications, selectedAccount, setSelectedAccount, showCreateAccount, setShowCreateAccount,
    newAccountType, setNewAccountType, pendingCloseId, setPendingCloseId,
    showNotifications, setShowNotifications, managerData, managerSearch, setManagerSearch, managerReportFilter,
    setManagerReportFilter, showManagerReport, setShowManagerReport, transferFrom, setTransferFrom, transferTo, setTransferTo,
    transferAmount, setTransferAmount, transferNote, setTransferNote, payee, setPayee, paymentAmount, setPaymentAmount,
    paymentDate, setPaymentDate, frequency, setFrequency, atmSearch, setAtmSearch, atms, transactionSearch, setTransactionSearch,
    transactionType, setTransactionType, transactionStart, setTransactionStart, transactionEnd, setTransactionEnd, profileDraft,
    setProfileDraft, unread, isManager, total, visibleTransactions, accountOptions,
    navigate, signIn, verifyMfa, resetPassword, signOut, submitTransfer, submitPayment, cancelPayment, createAccount,
    closeAccount, findAtms, saveProfile, markRead, openManager,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
