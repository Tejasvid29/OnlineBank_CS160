import React from 'react';
import { View } from 'react-native';
import { styles } from '../src/styles/appStyles';
import { Card, Choice, Divider, Field, Notice, SectionHeading } from '../src/ui/primitives';
import { ActivityRows } from '../src/components/ActivityRows';
import { useApp } from '../src/state/AppState';

export default function Activity() {
  const {
    notice, selectedAccount, setSelectedAccount, accountOptions, transactionSearch, setTransactionSearch,
    transactionType, setTransactionType, transactionStart, setTransactionStart, transactionEnd, setTransactionEnd,
    compact, visibleTransactions,
  } = useApp();

  return <>
    <SectionHeading title="Transaction history" subtitle="Search and filter the activity on your accounts." />
    <Notice text={notice} kind="error" />
    <Card>
      <View style={[styles.filterGrid, compact && styles.stack]}>
        <View style={styles.filterCell}><Choice label="Account" value={selectedAccount} options={[{ label: 'All accounts', value: 'all' }, ...accountOptions]} onChange={setSelectedAccount} /></View>
        <View style={styles.filterCell}><Field label="Search" value={transactionSearch} onChangeText={setTransactionSearch} placeholder="Merchant or description" /></View>
        <View style={styles.filterCell}><Choice label="Type" value={transactionType} options={['All', 'Deposit', 'Withdrawal', 'Transfer', 'Bill payment', 'Card purchase'].map((value) => ({ label: value, value }))} onChange={setTransactionType} /></View>
      </View>
      <View style={[styles.filterGrid, compact && styles.stack]}>
        <View style={styles.filterCell}><Field label="From date" value={transactionStart} onChangeText={setTransactionStart} placeholder="YYYY-MM-DD" /></View>
        <View style={styles.filterCell}><Field label="To date" value={transactionEnd} onChangeText={setTransactionEnd} placeholder="YYYY-MM-DD" /></View>
      </View>
      <Divider />
      <ActivityRows rows={visibleTransactions} />
    </Card>
  </>;
}
