import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { colors, money, titleCase } from '../theme';
import { styles } from '../styles/appStyles';
import { Action, Card, Choice, Field, Icon, LinkButton, Notice } from '../ui/primitives';
import { ATM_DAILY_LIMIT, ATM_MAX_DEPOSIT, ATM_MAX_WITHDRAWAL } from '../data/atmLimits';
import { useApp } from '../state/AppState';

const QUICK_WITHDRAWALS = ['20', '40', '60', '100', '200', '500', '1000'];
const QUICK_DEPOSITS = ['20', '50', '100', '500', '1000'];
const KINDS = [{ value: 'withdrawal', label: 'Withdraw cash' }, { value: 'deposit', label: 'Deposit cash' }];

// A simulated ATM session for one machine: pick a checking account, deposit or withdraw, and get a receipt.
export function AtmTerminal({ atm, onClose }) {
  const { accounts, atmTransaction, atmWithdrawalAllowance } = useApp();
  const checking = accounts.filter((account) => account.account_type === 'checking' && account.status === 'activated');
  const [accountId, setAccountId] = useState(checking[0]?.id || '');
  const [kind, setKind] = useState('withdrawal');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const account = checking.find((item) => item.id === accountId);

  async function submit() {
    setWorking(true); setError('');
    try {
      const balance = await atmTransaction({ kind, accountId, amount, atm });
      setReceipt({ kind, amount: Number(amount), balance, account: `${titleCase(account.account_type)} ${account.account_number}`, at: new Date().toLocaleString() });
    } catch (failure) { setError(failure.message || 'The ATM could not complete this transaction.'); }
    finally { setWorking(false); }
  }

  function another() { setReceipt(null); setAmount(''); setError(''); }

  return <Card style={{ marginVertical: 12, borderColor: colors.blue, borderWidth: 1 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name="card-outline" size={24} />
      <View style={{ flex: 1 }}><Text style={styles.cardTitle}>ATM · {atm.name}</Text><Text style={styles.rowSub}>Simulated machine. No real cash is dispensed or accepted.</Text></View>
    </View>
    {!checking.length ? <Notice text="You need an activated checking account to use the ATM." kind="error" /> : receipt ? <>
      <Notice text={`${receipt.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} of ${money(receipt.amount)} complete.`} kind="success" />
      <View style={styles.simpleRow}>
        <Text style={styles.rowTitle}>Receipt</Text>
        <Text style={styles.rowSub}>{atm.name}</Text>
        <Text style={styles.rowSub}>{receipt.account}</Text>
        <Text style={styles.rowSub}>{receipt.kind === 'deposit' ? 'Cash deposit' : 'Cash withdrawal'}: {money(receipt.amount)}</Text>
        <Text style={styles.rowSub}>New balance: {money(receipt.balance)}</Text>
        <Text style={styles.rowSub}>{receipt.at}</Text>
      </View>
      <Action onPress={another} icon="refresh-outline">Another transaction</Action>
      <LinkButton onPress={onClose}>Finish and leave ATM</LinkButton>
    </> : <>
      <Notice text={error} kind="error" />
      <Choice label="Account" value={accountId} options={checking.map((item) => ({ value: item.id, label: `${titleCase(item.account_type)} ${item.account_number}` }))} onChange={setAccountId} />
      <Text style={styles.rowSub}>Available balance: {money(account?.balance ?? 0)}</Text>
      <Text style={styles.rowSub}>{kind === 'withdrawal'
        ? `Withdraw up to ${money(ATM_MAX_WITHDRAWAL)} at a time. ${money(atmWithdrawalAllowance(accountId))} left of your ${money(ATM_DAILY_LIMIT)} daily limit.`
        : `Deposit whole dollar amounts, up to ${money(ATM_MAX_DEPOSIT)} at a time.`}</Text>
      <Choice label="What would you like to do?" value={kind} options={KINDS} onChange={setKind} />
      <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(kind === 'withdrawal' ? QUICK_WITHDRAWALS : QUICK_DEPOSITS).map((quick) => <Action key={quick} variant="secondary" onPress={() => setAmount(quick)}>{`$${quick}`}</Action>)}
      </View>
      <Action onPress={submit} disabled={working || !account} icon="checkmark-outline">{working ? 'Processing…' : kind === 'deposit' ? 'Deposit' : 'Withdraw'}</Action>
      <LinkButton onPress={onClose}>Cancel and leave ATM</LinkButton>
    </>}
  </Card>;
}
