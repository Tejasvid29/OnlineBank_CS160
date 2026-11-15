import React, { useState } from 'react';
import { View } from 'react-native';
import { accountSearchValues, customerSearchValues, matchesWords, money, searchWords, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import CustomerAuditRow from '../src/components/AuditLog';
import ReportBuilder from '../src/components/ReportBuilder';
import { Card, Field, SectionHeading, Text } from '../src/ui/primitives';
import { TEXT_CAP, useTextScale } from '../src/ui/textScale';
import { SegmentedTabs, usePullToRefresh } from '../src/ui/mobilePrimitives';
import MobileCheckReview from '../src/components/MobileCheckReview';
import { useApp } from '../src/state/AppState';

const TABS = [['customers', 'Customers'], ['accounts', 'Accounts'], ['checks', 'Checks'], ['reports', 'Reports']];

// Native manager dashboard: totals, then customers / accounts / checks / reports as tabs. The search field filters the
// customer and account lists, so it appears in those two tabs. Inactive tabs stay mounted (hidden) so the
// report filters survive switching tabs. Pull to refresh reloads the check list on the Checks tab.
export default function Manager() {
  const { isManager, managerSearch, setManagerSearch, managerData, refreshCheckReviews } = useApp();
  const [tab, setTab] = useState('customers');
  const { large } = useTextScale();
  usePullToRefresh(isManager && tab === 'checks' ? () => refreshCheckReviews() : null);

  if (!isManager) return <SectionHeading title="Access denied" subtitle="This page is available to authorized staff only." />;

  // Word by word over the values each row shows (theme.js, shared with the web dashboard), never field names.
  const words = searchWords(managerSearch);
  const customers = managerData.customers.filter((item) => matchesWords(words, customerSearchValues(item)));
  const managedAccounts = managerData.accounts.filter((item) => matchesWords(words, accountSearchValues(item)));
  const owner = (account) => `${account.users?.first_name || ''} ${account.users?.last_name || ''}`.trim();
  const search = <Field label="Search customers and accounts" value={managerSearch} onChangeText={setManagerSearch} placeholder="Name, email, ZIP, account number or ID" />;

  return <>
    <SectionHeading title="Manager dashboard" subtitle="Authorized staff view" />
    {/* Large text: the two totals stack, so CUSTOMERS and ACCOUNTS aren't broken mid-word. */}
    <View style={[styles.nativeRow2, large && styles.nativeRow2Large]}>
      <Card style={[styles.nativeCard, !large && styles.nativeCell]}><Text style={styles.miniLabel}>CUSTOMERS</Text><Text style={styles.summaryAmount} maxFontSizeMultiplier={TEXT_CAP.display}>{managerData.customers.length}</Text></Card>
      <Card style={[styles.nativeCard, !large && styles.nativeCell]}><Text style={styles.miniLabel}>ACCOUNTS</Text><Text style={styles.summaryAmount} maxFontSizeMultiplier={TEXT_CAP.display}>{managerData.accounts.length}</Text></Card>
    </View>
    <SegmentedTabs options={TABS} value={tab} onChange={setTab} style={styles.nativeSegmentInline} />
    <View style={tab !== 'customers' && styles.nativeHidden}>
      {search}
      <Card style={styles.nativeCard}>
        <Text style={styles.rowSub}>{customers.length} shown</Text>
        {customers.length ? customers.map((item, index) => <CustomerAuditRow customer={item} key={item.id || index} />) : <Text style={styles.emptyText}>No matching customers.</Text>}
      </Card>
    </View>
    <View style={tab !== 'accounts' && styles.nativeHidden}>
      {search}
      <Card style={styles.nativeCard}>
        <Text style={styles.rowSub}>{managedAccounts.length} shown</Text>
        {managedAccounts.length ? managedAccounts.map((item, index) => <View style={styles.simpleRow} key={item.id || index}><Text style={styles.rowTitle}>{titleCase(item.account_type)} · {item.account_number || item.id}</Text><Text style={styles.rowSub}>{owner(item) ? `${owner(item)} · ` : ''}{money(item.balance || 0)} · {titleCase(item.status)}</Text></View>) : <Text style={styles.emptyText}>No matching accounts.</Text>}
      </Card>
    </View>
    <View style={tab !== 'checks' && styles.nativeHidden}>
      <MobileCheckReview />
    </View>
    <View style={tab !== 'reports' && styles.nativeHidden}>
      <Card style={styles.nativeCard}>
        <Text style={[styles.rowSub, { marginBottom: 12 }]}>Summary stats by customer and account attributes</Text>
        <ReportBuilder />
      </Card>
    </View>
  </>;
}
