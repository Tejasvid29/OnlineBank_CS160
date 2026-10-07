import React from 'react';
import { Text, View } from 'react-native';
import { money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Choice, Divider, Field, Icon, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

export default function Transfer() {
  const {
    notice, transferFrom, setTransferFrom, transferTo, setTransferTo, transferAmount, setTransferAmount,
    transferNote, setTransferNote, submitTransfer, busy, accountOptions, accounts, compact,
  } = useApp();

  return <>
    <SectionHeading title="Transfer money" subtitle="Move money between your accounts." />
    <Notice text={notice} kind={notice.includes('completed') ? 'success' : 'error'} />
    <View style={[styles.twoColumns, compact && styles.stack]}>
      <Card style={styles.formCard}>
        <Text style={styles.cardTitle}>Transfer details</Text>
        <Choice label="From" value={transferFrom} options={accountOptions} onChange={setTransferFrom} />
        <Choice label="To" value={transferTo} options={accountOptions} onChange={setTransferTo} />
        <Field label="Amount" value={transferAmount} onChangeText={setTransferAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Field label="Memo (optional)" value={transferNote} onChangeText={setTransferNote} placeholder="What is this for?" />
        <Action onPress={submitTransfer} disabled={busy} icon="arrow-forward-outline">{busy ? 'Working…' : 'Transfer money'}</Action>
      </Card>
      <Card style={styles.asideCard}>
        <Icon name="information-circle-outline" size={26} />
        <Text style={styles.cardTitle}>Before you transfer</Text>
        <Text style={styles.bodyText}>Transfers between your own accounts update both balances together. Check the amount and destination before submitting.</Text>
        <Divider />
        <Text style={styles.rowSub}>Available in {titleCase(accounts.find((item) => item.id === transferFrom)?.account_type) || 'selected account'}</Text>
        <Text style={styles.asideAmount}>{money(accounts.find((item) => item.id === transferFrom)?.balance ?? 0)}</Text>
      </Card>
    </View>
  </>;
}
