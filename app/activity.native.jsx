import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../src/styles/appStyles';
import { Card, Field, LinkButton, SectionHeading } from '../src/ui/primitives';
import { Collapsible, DateField, Select, fromYmd } from '../src/ui/mobilePrimitives';
import { ActivityRows } from '../src/components/ActivityRows';
import { useApp } from '../src/state/AppState';

const TYPES = ['All', 'Deposit', 'Withdrawal', 'Transfer', 'Bill payment', 'Card purchase'];

// Native activity: search on top, filters (account, type, date range) folded into one section, then the list.
export default function Activity() {
  const {
    selectedAccount, setSelectedAccount, accountOptions, transactionSearch, setTransactionSearch,
    transactionType, setTransactionType, transactionStart, setTransactionStart, transactionEnd, setTransactionEnd,
    visibleTransactions,
  } = useApp();
  const active = [selectedAccount !== 'all', transactionType !== 'All', Boolean(transactionStart), Boolean(transactionEnd)].filter(Boolean).length;
  const clear = () => { setSelectedAccount('all'); setTransactionType('All'); setTransactionStart(''); setTransactionEnd(''); };

  return <>
    <SectionHeading title="Activity" />
    <Field label="Search" value={transactionSearch} onChangeText={setTransactionSearch} placeholder="Merchant or description" />
    <Collapsible title="Filters" subtitle={active ? `${active} active` : 'All accounts, any type, any date'}>
      <Select label="Account" value={selectedAccount} options={[{ label: 'All accounts', value: 'all' }, ...accountOptions]} onChange={setSelectedAccount} />
      <Select label="Type" value={transactionType} options={TYPES.map((value) => ({ label: value === 'All' ? 'All types' : value, value }))} onChange={setTransactionType} />
      <View style={styles.nativeRow2}>
        <View style={styles.nativeCell}><DateField label="From" value={transactionStart} onChange={setTransactionStart} maximumDate={transactionEnd ? fromYmd(transactionEnd) : new Date()} placeholder="Any" clearable /></View>
        <View style={styles.nativeCell}><DateField label="To" value={transactionEnd} onChange={setTransactionEnd} minimumDate={transactionStart ? fromYmd(transactionStart) : undefined} maximumDate={new Date()} placeholder="Any" clearable /></View>
      </View>
      {active > 0 && <LinkButton onPress={clear} icon="close-outline">Clear filters</LinkButton>}
    </Collapsible>
    <Text style={styles.nativeCount}>{visibleTransactions.length} {visibleTransactions.length === 1 ? 'transaction' : 'transactions'}</Text>
    <Card style={styles.nativeListCard}><ActivityRows rows={visibleTransactions} /></Card>
  </>;
}
