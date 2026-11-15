import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { colors, dateLabel, money } from '../src/theme';
import { apiConfigured } from '../src/services/api';
import { styles } from '../src/styles/appStyles';
import { Card, Icon, LinkButton, SectionHeading, Text } from '../src/ui/primitives';
import { TEXT_CAP, useTextScale } from '../src/ui/textScale';
import { usePullToRefresh } from '../src/ui/mobilePrimitives';
import { AccountCard } from '../src/components/AccountCard';
import { ActivityRows } from '../src/components/ActivityRows';
import { useApp } from '../src/state/AppState';

const SHORTCUTS = [
  ['Transfer', 'swap-horizontal-outline', '/transfer'],
  ['Pay bills', 'receipt-outline', '/payments'],
  ['Deposit', 'camera-outline', '/checks'],
  ['Activity', 'list-outline', '/activity'],
  ['ATMs', 'location-outline', '/atms'],
];

// Native overview: balance in the hero, shortcuts, compact accounts, and a scrollable recent-activity card.
// Pull down to reload balances, activity, payments and notifications (API mode; demo data stays as it is).
export default function Overview() {
  const { profile, accounts, payments, transactions, total, navigate, refreshData } = useApp();
  usePullToRefresh(apiConfigured ? refreshData : null);
  const { large } = useTextScale();
  // At large text sizes a row is several lines tall, so the short scrolling box would show one or two at a time:
  // show the latest five in full instead, with View all for the rest.
  const recent = [...transactions].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, large ? 5 : 20);
  const nextPayment = [...payments].sort((a, b) => a.next_payment_date.localeCompare(b.next_payment_date))[0];

  return <>
    <View style={styles.nativeHero}>
      <Text style={styles.heroEyebrow}>GOOD TO SEE YOU</Text>
      <Text style={styles.nativeHeroTitle} maxFontSizeMultiplier={TEXT_CAP.heading}>Hi, {profile.first_name || 'there'}</Text>
      <Text style={styles.nativeHeroLabel}>Total balance</Text>
      <Text style={styles.nativeHeroAmount} maxFontSizeMultiplier={TEXT_CAP.display} numberOfLines={1} adjustsFontSizeToFit>{money(total)}</Text>
      <Text style={styles.heroSubtitle}>Across {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</Text>
    </View>

    {/* Five tiles in a row leave no room for large text, so they become a list. */}
    {large ? <Card style={styles.nativeQuickList}>
      {SHORTCUTS.map(([label, icon, target]) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => navigate(target)} style={({ pressed }) => [styles.nativeQuickItem, pressed && styles.pressed]}>
        <View style={styles.nativeQuickIcon}><Icon name={icon} size={22} /></View>
        <Text style={[styles.nativeQuickLabel, { flex: 1 }]}>{label}</Text>
        <Icon name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>)}
    </Card> : <View style={styles.nativeQuickRow}>
      {SHORTCUTS.map(([label, icon, target]) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={() => navigate(target)} style={styles.nativeQuick}>
        <View style={styles.nativeQuickIcon}><Icon name={icon} size={22} /></View>
        <Text style={styles.nativeQuickLabel}>{label}</Text>
      </Pressable>)}
    </View>}

    <SectionHeading title="Accounts" action="See all" onAction={() => navigate('/accounts')} />
    <View style={styles.nativeList}>{accounts.map((account, index) => <AccountCard key={account.id} account={account} index={index} />)}</View>

    <Pressable accessibilityRole="button" onPress={() => navigate('/payments')}>
      <Card style={styles.nativeLinkRow}>
        <View style={styles.paymentIcon}><Icon name="calendar-outline" size={19} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Upcoming payments</Text>
          <Text style={styles.rowSub}>{payments.length ? `${payments.length} scheduled · next ${nextPayment.recipient}, ${dateLabel(nextPayment.next_payment_date)}` : 'Nothing scheduled'}</Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.muted} />
      </Card>
    </Pressable>

    <Card style={styles.nativeListCard}>
      <View style={styles.nativeCardHeading}>
        <Text style={styles.nativeSectionTitle} maxFontSizeMultiplier={TEXT_CAP.heading}>Recent activity</Text>
        <LinkButton onPress={() => navigate('/activity')} icon="arrow-forward">View all</LinkButton>
      </View>
      {large
        ? (recent.length ? <ActivityRows rows={recent} /> : <Text style={styles.emptyText}>No recent activity.</Text>)
        : <ScrollView style={styles.nativeRecentList} nestedScrollEnabled showsVerticalScrollIndicator>
          {recent.length ? <ActivityRows rows={recent} /> : <Text style={styles.emptyText}>No recent activity.</Text>}
        </ScrollView>}
    </Card>
  </>;
}
