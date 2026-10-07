import React from 'react';
import { Text } from 'react-native';
import { isActivated, money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Field } from '../src/ui/primitives';
import { Select } from '../src/ui/mobilePrimitives';
import { useApp } from '../src/state/AppState';

// Native transfer: one card, account dropdowns with balances, and the source balance beside "From".
export default function Transfer() {
  const {
    transferFrom, setTransferFrom, transferTo, setTransferTo, transferAmount, setTransferAmount,
    transferNote, setTransferNote, submitTransfer, busy, accounts,
  } = useApp();
  const options = accounts.filter(isActivated).map((item) => ({ value: item.id, label: `${titleCase(item.account_type)} ${item.account_number}`, detail: `Balance ${money(item.balance)}` }));
  const source = accounts.find((item) => item.id === transferFrom);

  return <Card style={styles.nativeCard}>
    <Select label="From" value={transferFrom} options={options} onChange={setTransferFrom}
      labelRight={source && <Text style={styles.nativeLabelRight}>Balance <Text style={styles.nativeLabelRightStrong}>{money(source.balance)}</Text></Text>} />
    <Select label="To" value={transferTo} options={options} onChange={setTransferTo} />
    <Field label="Amount" value={transferAmount} onChangeText={setTransferAmount} keyboardType="decimal-pad" placeholder="0.00" />
    <Field label="Memo (optional)" value={transferNote} onChangeText={setTransferNote} placeholder="What is this for?" />
    <Action onPress={submitTransfer} disabled={busy} icon="arrow-forward-outline" style={styles.nativeFullAction}>{busy ? 'Working…' : 'Transfer money'}</Action>
    <Text style={styles.nativeHint}>Transfers between your own accounts update both balances together. Check the amount and destination before submitting.</Text>
  </Card>;
}
