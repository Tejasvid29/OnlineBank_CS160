import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, money } from '../theme';
import { styles } from '../styles/appStyles';
import { Card, Icon, LinkButton, Status } from '../ui/primitives';
import { useApp } from '../state/AppState';

// Native: a compact one-row card (name left, balance right) instead of the tall web card.
export function AccountCard({ account, index }) {
  const { navigate, setSelectedAccount, setTransferFrom } = useApp();
  const closed = account.status === 'closed';
  const viewActivity = () => { setSelectedAccount(account.id); navigate('/activity'); };

  return <Card style={styles.nativeAccountCard}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${account.account_type} ${account.account_number}, available ${money(account.available ?? account.balance)}. View activity`} onPress={viewActivity} style={styles.nativeAccountRow}>
      <View style={[styles.nativeAccountIcon, index % 2 && { backgroundColor: '#E5F5EF' }]}>
        <Icon name={index % 2 ? 'trending-up-outline' : 'wallet-outline'} size={21} color={index % 2 ? colors.green : colors.blue} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{account.account_type}</Text>
        <Text style={styles.rowSub}>{account.account_number}</Text>
      </View>
      <View>
        <Text style={styles.nativeAccountBalance}>{money(account.available ?? account.balance)}</Text>
        {closed ? <Status color={colors.muted}>Closed</Status> : <Text style={[styles.rowSub, { textAlign: 'right', marginTop: 2 }]}>Available</Text>}
      </View>
    </Pressable>
    <View style={styles.nativeAccountActions}>
      <LinkButton onPress={viewActivity} icon="arrow-forward">Activity</LinkButton>
      {!closed && <LinkButton onPress={() => { setTransferFrom(account.id); navigate('/transfer'); }}>Transfer</LinkButton>}
    </View>
  </Card>;
}
