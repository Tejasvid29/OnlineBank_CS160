import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { money } from '../theme';
import { styles } from '../styles/appStyles';
import { Action, Choice, Divider, Field } from '../ui/primitives';
import { DateField, fromYmd } from '../ui/mobilePrimitives';
import { useApp } from '../state/AppState';

const options = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const GROUP_BY = options([['none', 'None'], ['zip_code', 'ZIP code'], ['account_type', 'Account type'], ['account_status', 'Status'], ['customer', 'Customer']]);
const TYPES = options([['all', 'All'], ['checking', 'Checking'], ['savings', 'Savings']]);
const STATUSES = options([['all', 'All'], ['activated', 'Activated'], ['deactivated', 'Deactivated']]);
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
const EMPTY = { group_by: 'none', account_type: 'all', account_status: 'all', zip_code: '', min_balance: '', max_balance: '', created_from: '', created_to: '' };

function StatRow({ title, stats }) {
  return <View style={styles.simpleRow}>
    <Text style={styles.rowTitle}>{title}</Text>
    <Text style={styles.rowSub}>{stats.customer_count} customers · {stats.account_count} accounts · Total {money(stats.total_balance)}</Text>
    <Text style={styles.rowSub}>Avg {money(stats.average_balance)} · Min {money(stats.min_balance)} · Max {money(stats.max_balance)}</Text>
  </View>;
}

// Shared by the web and native manager screens: filter + group-by form and the resulting summary stats.
export default function ReportBuilder() {
  const { reportResult, runReport } = useApp();
  const [filters, setFilters] = useState(EMPTY);
  const set = (key) => (value) => setFilters((current) => ({ ...current, [key]: value }));

  return <>
    <Choice label="Group by" value={filters.group_by} options={GROUP_BY} onChange={set('group_by')} />
    <Choice label="Account type" value={filters.account_type} options={TYPES} onChange={set('account_type')} />
    <Choice label="Account status" value={filters.account_status} options={STATUSES} onChange={set('account_status')} />
    <Field label="ZIP code" value={filters.zip_code} onChangeText={set('zip_code')} placeholder="94105" />
    <Field label="Minimum balance" value={filters.min_balance} onChangeText={set('min_balance')} placeholder="0" />
    <Field label="Maximum balance" value={filters.max_balance} onChangeText={set('max_balance')} placeholder="50000" />
    {isNative ? <View style={styles.nativeRow2}>
      <View style={styles.nativeCell}><DateField label="Opened from" value={filters.created_from} onChange={set('created_from')} maximumDate={filters.created_to ? fromYmd(filters.created_to) : new Date()} placeholder="Any" clearable /></View>
      <View style={styles.nativeCell}><DateField label="Opened to" value={filters.created_to} onChange={set('created_to')} minimumDate={filters.created_from ? fromYmd(filters.created_from) : undefined} maximumDate={new Date()} placeholder="Any" clearable /></View>
    </View> : <>
      <Field label="Opened from" value={filters.created_from} onChangeText={set('created_from')} placeholder="YYYY-MM-DD" />
      <Field label="Opened to" value={filters.created_to} onChangeText={set('created_to')} placeholder="YYYY-MM-DD" />
    </>}
    <Action variant="secondary" onPress={() => runReport(filters)}>Run report</Action>
    {reportResult && <View style={styles.reportSummary}>
      <StatRow title="Overall" stats={reportResult.totals} />
      {reportResult.group_by !== 'none' && <>
        <Divider />
        {reportResult.groups.length ? reportResult.groups.map((group) => <StatRow key={group.group} title={group.group} stats={group} />) : <Text style={styles.emptyText}>No accounts match these filters.</Text>}
      </>}
    </View>}
  </>;
}
