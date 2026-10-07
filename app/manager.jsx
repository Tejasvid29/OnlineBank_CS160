import React from 'react';
import { Text, View } from 'react-native';
import { money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Choice, Divider, Field, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

export default function Manager() {
  const {
    isManager, managerSearch, setManagerSearch, managerData, managerReportFilter, setManagerReportFilter,
    showManagerReport, setShowManagerReport, notice, compact,
  } = useApp();

  if (!isManager) return <SectionHeading title="Access denied" subtitle="This page is available to authorized staff only." />;

  const query = managerSearch.toLowerCase();
  const customers = managerData.customers.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  const managedAccounts = managerData.accounts.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  const reportAccounts = managerData.accounts.filter((item) => managerReportFilter === 'All' || item.status?.toLowerCase() === managerReportFilter.toLowerCase());

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
      <Choice label="Account status" value={managerReportFilter} options={['All', 'Activated', 'Deactivated'].map((value) => ({ label: value, value }))} onChange={(value) => { setManagerReportFilter(value); setShowManagerReport(false); }} />
      <Action variant="secondary" onPress={() => setShowManagerReport(true)}>Generate summary</Action>
      {showManagerReport && <View style={styles.reportSummary}>
        <Text style={styles.rowTitle}>{managerReportFilter} accounts: {reportAccounts.length}</Text>
        <Text style={styles.rowSub}>Combined balance: {money(reportAccounts.reduce((sum, item) => sum + Number(item.balance || 0), 0))}</Text>
      </View>}
      {managerData.reports.length ? managerData.reports.map((item, index) => <View key={item.id || index} style={styles.simpleRow}><Text style={styles.rowTitle}>{item.title || item.name || `Report ${index + 1}`}</Text><Text style={styles.rowSub}>{item.summary || item.description || 'Report available'}</Text></View>) : <Text style={styles.emptyText}>No saved reports available.</Text>}
    </Card>
  </>;
}
