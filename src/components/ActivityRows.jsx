import React from 'react';
import { View } from 'react-native';
import { colors, dateLabel, money } from '../theme';
import { styles } from '../styles/appStyles';
import { Icon, Text } from '../ui/primitives';
import { useTextScale } from '../ui/textScale';

// Used by web and phone. On a phone at large text sizes the amount goes under the description instead of beside it.
export function ActivityRows({ rows }) {
  const { large } = useTextScale();
  return rows.length ? rows.map((item) => {
    const amount = <Text style={[styles.transactionAmount, item.amount >= 0 && { color: colors.green }, large && styles.nativeAmountBelow]}>{item.amount >= 0 ? '+' : '−'}{money(Math.abs(item.amount))}</Text>;
    return <View key={item.id} style={styles.transactionRow}>
      <View style={[styles.transactionIcon, item.amount >= 0 && { backgroundColor: '#E5F5EF' }]}><Icon name={item.amount >= 0 ? 'arrow-down-outline' : 'arrow-up-outline'} size={18} color={item.amount >= 0 ? colors.green : colors.blue} /></View>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.description}</Text><Text style={styles.rowSub}>{dateLabel(item.created_at)}  ·  {item.transaction_type}  ·  {item.status}</Text>{large && amount}</View>{!large && amount}
    </View>;
  }) : <Text style={styles.emptyText}>No transactions match these filters.</Text>;
}
