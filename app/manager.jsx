import React from 'react';
import { Text, View } from 'react-native';
import { money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import ReportBuilder from '../src/components/ReportBuilder';
import { Card, Divider, Field, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

export default function Manager() {
  const { isManager, managerSearch, setManagerSearch, managerData, notice, compact } = useApp();

  if (!isManager) return <SectionHeading title="Access denied" subtitle="This page is available to authorized staff only." />;

  const query = managerSearch.toLowerCase();
  const customers = managerData.customers.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  const managedAccounts = managerData.accounts.filter((item) => JSON.stringify(item).toLowerCase().includes(query));

  return <>
    <SectionHeading title="Manager dashboard" subtitle="Authorized staff view" />
    <Notice text={notice} kind="error" />
    <View style={[styles.summaryRow, compact && styles.stack]}>
      <Card style={styles.summaryCard}><Text style={styles.miniLabel}>CUSTOMERS</Text><Text style={styles.summaryAmount}>{managerData.customers.length}</Text></Card>
      <Card style={styles.summaryCard}><Text style={styles.miniLabel}>ACCOUNTS</Text><Text style={styles.summaryAmount}>{managerData.accounts.length}</Text></Card>
    </View>
    <Card>
      <Field label="Search customers and accounts" value={managerSearch} onChangeText={setManagerSearch} placeholder="Name, customer ID, or account ID" />
      <Divider />
      <Text style={styles.cardTitle}>Customers</Text>
      {customers.length ? customers.map((item, index) => <View style={styles.simpleRow} key={item.id || index}><Text style={styles.rowTitle}>{item.first_name} {item.last_name}</Text><Text style={styles.rowSub}>{item.id}</Text></View>) : <Text style={styles.emptyText}>No matching customers.</Text>}
      <Divider />
      <Text style={styles.cardTitle}>Accounts</Text>
      {managedAccounts.length ? managedAccounts.map((item, index) => <View style={styles.simpleRow} key={item.id || index}><Text style={styles.rowTitle}>{titleCase(item.account_type)} · {item.account_number || item.id}</Text><Text style={styles.rowSub}>{money(item.balance || 0)} · {titleCase(item.status)}</Text></View>) : <Text style={styles.emptyText}>No matching accounts.</Text>}
      <Divider />
      <Text style={styles.cardTitle}>Reports</Text>
      <ReportBuilder />
    </Card>
  </>;
}
