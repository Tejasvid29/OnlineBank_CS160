import React from 'react';
import { Text } from 'react-native';
import { isActivated, money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Field } from '../src/ui/primitives';
import { Select } from '../src/ui/mobilePrimitives';
import { useApp } from '../src/state/AppState';

// Native Send Money: pick a source account, enter the recipient's account number and an amount.
export default function SendMoney() {
  const {
    sendFrom, setSendFrom, sendRecipient, setSendRecipient, sendAmount, setSendAmount,
    sendNote, setSendNote, submitSendMoney, busy, accounts,
  } = useApp();
  const options = accounts.filter(isActivated).map((item) => ({ value: item.id, label: `${titleCase(item.account_type)} ${item.account_number}`, detail: `Balance ${money(item.balance)}` }));
  const source = accounts.find((item) => item.id === sendFrom);

  return <Card style={styles.nativeCard}>
    <Select label="From" value={sendFrom} options={options} onChange={setSendFrom}
      labelRight={source && <Text style={styles.nativeLabelRight}>Balance <Text style={styles.nativeLabelRightStrong}>{money(source.balance)}</Text></Text>} />
    <Field label="Recipient account number" value={sendRecipient} onChangeText={setSendRecipient} keyboardType="number-pad" placeholder="12-digit account number" />
    <Field label="Amount" value={sendAmount} onChangeText={setSendAmount} keyboardType="decimal-pad" placeholder="0.00" />
    <Field label="Memo (optional)" value={sendNote} onChangeText={setSendNote} placeholder="What is this for?" />
    <Action onPress={submitSendMoney} disabled={busy} icon="paper-plane-outline" style={styles.nativeFullAction}>{busy ? 'Working…' : 'Send money'}</Action>
    <Text style={styles.nativeHint}>Money moves immediately and cannot be taken back. Confirm the recipient's account number with them first.</Text>
  </Card>;
}
