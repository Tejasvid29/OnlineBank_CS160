import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import ReportBuilder from '../src/components/ReportBuilder';
import { Card, Field, SectionHeading } from '../src/ui/primitives';
import { SegmentedTabs } from '../src/ui/mobilePrimitives';
import { useApp } from '../src/state/AppState';

const TABS = [['customers', 'Customers'], ['accounts', 'Accounts'], ['reports', 'Reports']];

// Native manager dashboard: totals, then customers / accounts / reports as tabs. The search field filters the
// customer and account lists, so it appears in those two tabs. Inactive tabs stay mounted (hidden) so the
// report filters survive switching tabs.
export default function Manager() {
  const { isManager, managerSearch, setManagerSearch, managerData } = useApp();
  const [tab, setTab] = useState('customers');

  if (!isManager) return <SectionHeading title="Access denied" subtitle="This page is available to authorized staff only." />;

  const words = managerSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (item) => {
    const text = Object.values(item).filter((value) => value != null).join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  };
  const customers = managerData.customers.filter(matches);
  const managedAccounts = managerData.accounts.filter(matches);
  const search = <Field label="Search customers and accounts" value={managerSearch} onChangeText={setManagerSearch} placeholder="Name, customer ID, or account ID" />;

  return <>
    <SectionHeading title="Manager dashboard" subtitle="Authorized staff view" />
    <View style={styles.nativeRow2}>
      <Card style={[styles.nativeCard, styles.nativeCell]}><Text style={styles.miniLabel}>CUSTOMERS</Text><Text style={styles.summaryAmount}>{managerData.customers.length}</Text></Card>
      <Card style={[styles.nativeCard, styles.nativeCell]}><Text style={styles.miniLabel}>ACCOUNTS</Text><Text style={styles.summaryAmount}>{managerData.accounts.length}</Text></Card>
    </View>
    <SegmentedTabs options={TABS} value={tab} onChange={setTab} style={styles.nativeSegmentInline} />
    <View style={tab !== 'customers' && styles.nativeHidden}>
      {search}
      <Card style={styles.nativeCard}>
        <Text style={styles.rowSub}>{customers.length} shown</Text>
        {customers.length ? customers.map((item, index) => <View style={styles.simpleRow} key={item.id || index}><Text style={styles.rowTitle}>{item.first_name} {item.last_name}</Text><Text style={styles.rowSub}>{item.id}</Text></View>) : <Text style={styles.emptyText}>No matching customers.</Text>}
      </Card>
    </View>
    <View style={tab !== 'accounts' && styles.nativeHidden}>
      {search}
      <Card style={styles.nativeCard}>
        <Text style={styles.rowSub}>{managedAccounts.length} shown</Text>
        {managedAccounts.length ? managedAccounts.map((item, index) => <View style={styles.simpleRow} key={item.id || index}><Text style={styles.rowTitle}>{titleCase(item.account_type)} · {item.account_number || item.id}</Text><Text style={styles.rowSub}>{money(item.balance || 0)} · {titleCase(item.status)}</Text></View>) : <Text style={styles.emptyText}>No matching accounts.</Text>}
      </Card>
    </View>
    <View style={tab !== 'reports' && styles.nativeHidden}>
      <Card style={styles.nativeCard}>
        <Text style={[styles.rowSub, { marginBottom: 12 }]}>Summary stats by customer and account attributes</Text>
        <ReportBuilder />
      </Card>
    </View>
  </>;
}
