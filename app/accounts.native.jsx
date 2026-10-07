import React from 'react';
import { Alert, Text, View } from 'react-native';
import { styles } from '../src/styles/appStyles';
import { Action, Choice, LinkButton, SectionHeading } from '../src/ui/primitives';
import { isActivated, titleCase } from '../src/theme';
import { Collapsible } from '../src/ui/mobilePrimitives';
import { AccountCard } from '../src/components/AccountCard';
import { useApp } from '../src/state/AppState';

// Native accounts: compact cards, with opening and closing accounts folded into sections below.
export default function Accounts() {
  const {
    showCreateAccount, setShowCreateAccount, newAccountType, setNewAccountType, createAccount, busy, accounts, closeAccount,
  } = useApp();
  const open = accounts.filter(isActivated);
  const confirmClose = (account) => Alert.alert('Close this account?', `${titleCase(account.account_type)} ${account.account_number} will be closed. Its history stays available.`, [
    { text: 'Keep account', style: 'cancel' },
    { text: 'Close account', style: 'destructive', onPress: () => closeAccount(account) },
  ]);

  return <>
    <SectionHeading title="Accounts" subtitle="Tap an account to see its activity." />
    <View style={styles.nativeList}>{accounts.map((account, index) => <AccountCard key={account.id} account={account} index={index} />)}</View>

    <Collapsible title="Open an account" subtitle="Checking or savings" open={showCreateAccount} onToggle={setShowCreateAccount}>
      <Choice label="Account type" value={newAccountType} options={[{ label: 'Checking', value: 'checking' }, { label: 'Savings', value: 'savings' }]} onChange={setNewAccountType} />
      <Text style={[styles.rowSub, { marginBottom: 16 }]}>New accounts open with a $0.00 balance.</Text>
      <Action onPress={createAccount} disabled={busy} style={styles.nativeFullAction}>{busy ? 'Working…' : 'Create account'}</Action>
    </Collapsible>

    <Collapsible title="Close an account" subtitle="Needs a $0 balance and no pending transactions">
      {open.length ? open.map((account) => <View key={account.id} style={styles.accountServiceRow}>
        <Text style={styles.rowSub}>{titleCase(account.account_type)} {account.account_number}</Text>
        <LinkButton onPress={() => confirmClose(account)}>Close</LinkButton>
      </View>) : <Text style={styles.emptyText}>No open accounts.</Text>}
    </Collapsible>
  </>;
}
