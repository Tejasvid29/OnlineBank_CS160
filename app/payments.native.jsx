import React from 'react';
import { Alert, Text, View } from 'react-native';
import { dateLabel, money } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Choice, Field, Icon, LinkButton, SectionHeading } from '../src/ui/primitives';
import { DateField, Select } from '../src/ui/mobilePrimitives';
import { useApp } from '../src/state/AppState';

// Native bill payments: full-width form with a date picker, then the upcoming list.
export default function Payments() {
  const {
    payee, setPayee, paymentAccount, setPaymentAccount, accounts, paymentAmount, setPaymentAmount,
    paymentDate, setPaymentDate, frequency, setFrequency, submitPayment, busy, payments, cancelPayment,
  } = useApp();
  const options = accounts.filter((item) => item.status !== 'closed').map((item) => ({ value: item.id, label: `${item.account_type} ${item.account_number}`, detail: `Available ${money(item.available ?? item.balance)}` }));
  const fromId = paymentAccount || accounts[0]?.id;
  const source = accounts.find((item) => item.id === fromId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const confirmCancel = (payment) => Alert.alert('Cancel this payment?', `${payment.recipient}, ${money(payment.amount)} on ${dateLabel(payment.next_payment_date)}.`, [
    { text: 'Keep payment', style: 'cancel' },
    { text: 'Cancel payment', style: 'destructive', onPress: () => cancelPayment(payment.id) },
  ]);

  return <>
    <Card style={styles.nativeCard}>
      <Field label="Payee" value={payee} onChangeText={setPayee} placeholder="Business or person" autoCapitalize="words" />
      <Select label="Pay from" value={fromId} options={options} onChange={setPaymentAccount}
        labelRight={source && <Text style={styles.nativeLabelRight}>Available <Text style={styles.nativeLabelRightStrong}>{money(source.available ?? source.balance)}</Text></Text>} />
      <Field label="Amount" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <DateField label="Payment date" value={paymentDate} onChange={setPaymentDate} minimumDate={today} />
      <Choice label="Repeat" value={frequency} options={['Once', 'Weekly', 'Monthly'].map((value) => ({ label: value, value }))} onChange={setFrequency} />
      <Action onPress={submitPayment} disabled={busy} icon="calendar-outline" style={styles.nativeFullAction}>{busy ? 'Working…' : 'Schedule payment'}</Action>
    </Card>

    <SectionHeading title="Upcoming payments" />
    <Card style={styles.nativeListCard}>
      {payments.length ? payments.map((payment) => <View key={payment.id} style={styles.paymentRow}>
        <View style={styles.paymentIcon}><Icon name="receipt-outline" size={19} /></View>
        <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{payment.recipient}</Text><Text style={styles.rowSub}>{dateLabel(payment.next_payment_date)} · {payment.frequency}</Text></View>
        <View style={{ alignItems: 'flex-end' }}><Text style={styles.transactionAmount}>{money(payment.amount)}</Text><LinkButton onPress={() => confirmCancel(payment)}>Cancel</LinkButton></View>
      </View>) : <Text style={styles.emptyText}>No payments scheduled.</Text>}
    </Card>
  </>;
}
