import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, money } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Card, Icon, Notice, SectionHeading } from '../src/ui/primitives';
import { AccountCard } from '../src/components/AccountCard';
import { ActivityRows } from '../src/components/ActivityRows';
import { useApp } from '../src/state/AppState';

export default function Overview() {
  const { profile, notice, accounts, payments, transactions, compact, navigate } = useApp();

  return <>
    <View style={styles.hero}>
      <View style={{ flex: 1 }}>
        <Text style={styles.heroEyebrow}>GOOD TO SEE YOU</Text>
        <Text style={styles.heroTitle}>Welcome back, {profile.first_name || 'there'}.</Text>
        <Text style={styles.heroSubtitle}>Here’s a clear view of your money today.</Text>
      </View>
      <View style={styles.heroDecoration}><Icon name="shield-checkmark-outline" size={42} color="#B9DBF7" /></View>
    </View>
    <Notice text={notice} kind={notice.includes('completed') || notice.includes('scheduled') ? 'success' : 'error'} />
    <View style={[styles.summaryRow, compact && styles.stack]}>
      <Card style={[styles.summaryCard, compact && styles.fullWidth]}><Text style={styles.miniLabel}>TOTAL BALANCE</Text><Text style={styles.summaryAmount}>{money(accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0))}</Text><Text style={styles.summaryCaption}>Across {accounts.length} accounts</Text></Card>
      <Card style={[styles.summaryCard, compact && styles.fullWidth]}><Text style={styles.miniLabel}>UPCOMING PAYMENTS</Text><Text style={styles.summaryAmount}>{payments.length}</Text><Text style={styles.summaryCaption}>Scheduled and ready</Text></Card>
    </View>
    <SectionHeading title="Your accounts" subtitle="Everything in one place" action="See all accounts" onAction={() => navigate('/accounts')} />
    <View style={[styles.accountsGrid, compact && styles.stack]}>{accounts.map((account, index) => <AccountCard key={account.id} account={account} index={index} />)}</View>
    <View style={[styles.twoColumns, compact && styles.stack]}>
      <Card style={[styles.columnCard, compact && styles.fullWidth]}>
        <SectionHeading title="Quick actions" />
        <View style={styles.quickGrid}>{[
          ['Move money', 'swap-horizontal-outline', '/transfer'], ['Pay a bill', 'receipt-outline', '/payments'], ['Find an ATM', 'location-outline', '/atms'], ['View activity', 'list-outline', '/activity'],
        ].map(([label, icon, target]) => <Pressable key={label} onPress={() => navigate(target)} style={styles.quickAction}><View style={styles.quickIcon}><Icon name={icon} size={22} /></View><Text style={styles.quickLabel}>{label}</Text></Pressable>)}</View>
      </Card>
      <Card style={[styles.columnCard, compact && styles.fullWidth]}><SectionHeading title="Recent activity" action="View all" onAction={() => navigate('/activity')} /><ActivityRows rows={transactions.slice(0, 3)} /></Card>
    </View>
  </>;
}
