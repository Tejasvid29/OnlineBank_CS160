import React from 'react';
import { Text, View } from 'react-native';
import { dateLabel, money } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Choice, Field, Icon, LinkButton, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

export default function Payments() {
  const {
    notice, payee, setPayee, selectedAccount, setSelectedAccount, accountOptions, accounts, paymentAmount,
    setPaymentAmount, paymentDate, setPaymentDate, frequency, setFrequency, submitPayment, busy, payments,
    cancelPayment, compact,
  } = useApp();

  return <>
    <SectionHeading title="Bill payments" subtitle="Schedule a payment and keep track of what’s next." />
    <Notice text={notice} kind={notice.includes('scheduled') || notice.includes('canceled') ? 'success' : 'error'} />
    <View style={[styles.twoColumns, compact && styles.stack]}>
      <Card style={styles.formCard}>
        <Text style={styles.cardTitle}>Schedule a payment</Text>
        <Field label="Payee" value={payee} onChangeText={setPayee} placeholder="Business or person" />
        <Choice label="Pay from" value={selectedAccount === 'all' ? accounts[0]?.id : selectedAccount} options={accountOptions} onChange={setSelectedAccount} />
        <Field label="Amount" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" placeholder="0.00" />
        <Field label="Payment date" value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" accessibilityHint="Enter a date in year-month-day format" />
        <Choice label="Repeat" value={frequency} options={['Once', 'Weekly', 'Monthly'].map((value) => ({ label: value, value }))} onChange={setFrequency} />
        <Action onPress={submitPayment} disabled={busy} icon="calendar-outline">{busy ? 'Working…' : 'Schedule payment'}</Action>
      </Card>
      <Card style={styles.columnCard}>
        <Text style={styles.cardTitle}>Upcoming payments</Text>
        {payments.length ? payments.map((payment) => <View key={payment.id} style={styles.paymentRow}>
          <View style={styles.paymentIcon}><Icon name="receipt-outline" size={19} /></View>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{payment.recipient}</Text><Text style={styles.rowSub}>{dateLabel(payment.next_payment_date)} · {payment.frequency}</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text style={styles.transactionAmount}>{money(payment.amount)}</Text><LinkButton onPress={() => cancelPayment(payment.id)}>Cancel</LinkButton></View>
        </View>) : <Text style={styles.emptyText}>No payments scheduled.</Text>}
      </Card>
    </View>
  </>;
}
