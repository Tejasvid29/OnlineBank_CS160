import React from 'react';
import { Text, View } from 'react-native';
import { money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Choice, Divider, Field, Icon, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

export default function SendMoney() {
  const {
    notice, sendFrom, setSendFrom, sendRecipient, setSendRecipient, sendAmount, setSendAmount,
    sendNote, setSendNote, submitSendMoney, busy, accountOptions, accounts, compact,
  } = useApp();
  const source = accounts.find((item) => item.id === sendFrom);

  return <>
    <SectionHeading title="Send Money" subtitle="Send money to another customer's account." />
    <Notice text={notice} kind={notice.startsWith('Sent') ? 'success' : 'error'} />
    <View style={[styles.twoColumns, compact && styles.stack]}>
      <Card style={styles.formCard}>
        <Text style={styles.cardTitle}>Payment details</Text>
        <Choice label="From" value={sendFrom} options={accountOptions} onChange={setSendFrom} />
        <Field label="Recipient account number" value={sendRecipient} onChangeText={setSendRecipient} keyboardType="number-pad" placeholder="12-digit account number" />
        <Field label="Amount" value={sendAmount} onChangeText={setSendAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Field label="Memo (optional)" value={sendNote} onChangeText={setSendNote} placeholder="What is this for?" />
        <Action onPress={submitSendMoney} disabled={busy} icon="paper-plane-outline">{busy ? 'Working…' : 'Send money'}</Action>
      </Card>
      <Card style={styles.asideCard}>
        <Icon name="information-circle-outline" size={26} />
        <Text style={styles.cardTitle}>Before you send</Text>
        <Text style={styles.bodyText}>Money moves immediately and cannot be taken back. Confirm the recipient's account number with them first. To move money between your own accounts, use Pay & transfer.</Text>
        <Divider />
        <Text style={styles.rowSub}>Available in {titleCase(source?.account_type) || 'selected account'}</Text>
        <Text style={styles.asideAmount}>{money(source?.balance ?? 0)}</Text>
      </Card>
    </View>
  </>;
}
