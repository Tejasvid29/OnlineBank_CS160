import React from 'react';
import { Text, View } from 'react-native';
import { colors, dateLabel, money } from '../theme';
import { styles } from '../styles/appStyles';
import { Icon } from '../ui/primitives';

export function ActivityRows({ rows }) {
  return rows.length ? rows.map((item) => <View key={item.id} style={styles.transactionRow}>
    <View style={[styles.transactionIcon, item.amount >= 0 && { backgroundColor: '#E5F5EF' }]}><Icon name={item.amount >= 0 ? 'arrow-down-outline' : 'arrow-up-outline'} size={18} color={item.amount >= 0 ? colors.green : colors.blue} /></View>
    <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{item.description}</Text><Text style={styles.rowSub}>{dateLabel(item.created_at)}  ·  {item.transaction_type}  ·  {item.status}</Text></View><Text style={[styles.transactionAmount, item.amount >= 0 && { color: colors.green }]}>{item.amount >= 0 ? '+' : '−'}{money(Math.abs(item.amount))}</Text>
  </View>) : <Text style={styles.emptyText}>No transactions match these filters.</Text>;
}
