import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Choice, Icon, LinkButton, Notice, SectionHeading } from '../src/ui/primitives';
import { isActivated, titleCase } from '../src/theme';
import { AccountCard } from '../src/components/AccountCard';
import { useApp } from '../src/state/AppState';

export default function Accounts() {
  const {
    notice, showCreateAccount, setShowCreateAccount, newAccountType, setNewAccountType, createAccount, busy, accounts, compact, pendingCloseId, setPendingCloseId, closeAccount,
  } = useApp();

  return <>
    <SectionHeading title="Accounts" subtitle="Choose an account to see its balance and activity." action={showCreateAccount ? 'Hide form' : 'Open an account'} onAction={() => setShowCreateAccount((value) => !value)} />
    <Notice text={notice} kind={notice.includes('created') || notice.includes('closed') ? 'success' : 'error'} />
    {showCreateAccount && <Card style={{ marginBottom: 18 }}>
      <Text style={styles.cardTitle}>Open an account</Text>
      <Choice label="Account type" value={newAccountType} options={[{ label: 'Checking', value: 'checking' }, { label: 'Savings', value: 'savings' }]} onChange={setNewAccountType} />
      <Text style={styles.rowSub}>New accounts open with a $0.00 balance.</Text>
      <Action onPress={createAccount} disabled={busy}>Create account</Action>
    </Card>}
    <View style={[styles.accountsGrid, compact && styles.stack]}>{accounts.map((account, index) => <AccountCard key={account.id} account={account} index={index} />)}</View>
    <Card style={styles.infoCard}>
      <Icon name="lock-closed-outline" size={22} />
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>Account services</Text><Text style={styles.rowSub}>An account must have a zero balance and no unresolved transactions before it can be closed.</Text></View>
    </Card>
    {accounts.filter(isActivated).map((account) => <View key={`close-${account.id}`} style={styles.accountServiceRow}>
      <Text style={styles.rowSub}>{titleCase(account.account_type)} {account.account_number}</Text>
      {pendingCloseId === account.id ? <View style={styles.accountServiceActions}>
        <Text style={styles.rowSub}>Close this account?</Text>
        <LinkButton onPress={() => closeAccount(account)}>Confirm close</LinkButton>
        <LinkButton onPress={() => setPendingCloseId(null)}>Keep account</LinkButton>
      </View> : <LinkButton onPress={() => setPendingCloseId(account.id)}>Close account</LinkButton>}
    </View>)}
  </>;
}
