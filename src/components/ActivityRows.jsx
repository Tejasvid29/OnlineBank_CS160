import React from 'react';
import { View } from 'react-native';
import { colors, dateLabel, money } from '../theme';
import { styles } from '../styles/appStyles';
import { Icon, Status, Text } from '../ui/primitives';
import { useTextScale } from '../ui/textScale';

// How a row looks depends on its status first and its sign second. A failed transaction (a rejected check deposit)
// never moved money: it is shown struck through with a red Failed badge, never as green money received. A pending one
// (a check awaiting review) hasn't moved money yet: amber Pending badge, amount in neutral ink.
function look(item) {
  const status = String(item.status || '').toLowerCase();
  const incoming = item.amount >= 0;
  if (status === 'failed') return { status, icon: 'close-circle-outline', tint: colors.red, iconBg: styles.transactionIconFailed, amount: styles.transactionAmountVoid, badge: colors.red, spoken: 'failed, not counted' };
  if (status === 'pending') return { status, icon: 'time-outline', tint: colors.amber, iconBg: styles.transactionIconPending, amount: null, badge: colors.amber, spoken: 'pending, not yet counted' };
  return incoming
    ? { status, icon: 'arrow-down-outline', tint: colors.green, iconBg: styles.transactionIconIn, amount: { color: colors.green }, badge: null, spoken: 'received' }
    : { status, icon: 'arrow-up-outline', tint: colors.blue, iconBg: null, amount: null, badge: null, spoken: 'paid' };
}

// Used by web and phone. On a phone at large text sizes the amount goes under the description instead of beside it.
export function ActivityRows({ rows }) {
  const { large } = useTextScale();
  return rows.length ? rows.map((item) => {
    const style = look(item);
    const sign = item.amount >= 0 ? '+' : '−';
    const side = <View style={large ? [styles.nativeStacked, { marginTop: 6 }] : styles.transactionSide}>
      <Text style={[styles.transactionAmount, style.amount, large && styles.nativeAmountBelow, large && { marginTop: 0 }]}>{sign}{money(Math.abs(item.amount))}</Text>
      {style.badge && <Status color={style.badge}>{style.status}</Status>}
    </View>;
    return <View
      key={item.id}
      style={styles.transactionRow}
      accessible
      accessibilityLabel={`${item.description}, ${sign === '+' ? '' : 'minus '}${money(Math.abs(item.amount))}, ${style.spoken}. ${item.transaction_type}, ${dateLabel(item.created_at)}`}
    >
      <View style={[styles.transactionIcon, style.iconBg]}><Icon name={style.icon} size={18} color={style.tint} /></View>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.description}</Text><Text style={styles.rowSub}>{dateLabel(item.created_at)}  ·  {item.transaction_type}{style.badge ? '' : `  ·  ${item.status}`}</Text>{large && side}</View>{!large && side}
    </View>;
  }) : <Text style={styles.emptyText}>No transactions match these filters.</Text>;
}
