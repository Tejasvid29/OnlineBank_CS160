import React from 'react';
import { Pressable, View } from 'react-native';
import { colors, isActivated, money, titleCase } from '../theme';
import { styles } from '../styles/appStyles';
import { Card, Icon, LinkButton, Status, Text } from '../ui/primitives';
import { useTextScale } from '../ui/textScale';
import { useApp } from '../state/AppState';

// Native: a compact one-row card (name left, balance right) instead of the tall web card.
export function AccountCard({ account, index }) {
  const { navigate, setSelectedAccount, setTransferFrom } = useApp();
  const closed = !isActivated(account);
  const { large } = useTextScale();
  const viewActivity = () => { setSelectedAccount(account.id); navigate('/activity'); };
  // Large text: the balance goes under the name instead of squeezing it.
  const balance = <View>
    <Text style={[styles.nativeAccountBalance, large && { textAlign: 'left', marginTop: 6 }]}>{money(account.balance)}</Text>
    {closed ? <Status color={colors.muted}>{titleCase(account.status)}</Status> : <Text style={[styles.rowSub, { textAlign: large ? 'left' : 'right', marginTop: 2 }]}>Balance</Text>}
  </View>;

  return <Card style={styles.nativeAccountCard}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${titleCase(account.account_type)} ${account.account_number}, ${closed ? `${titleCase(account.status)}, ` : ''}balance ${money(account.balance)}. View activity`} onPress={viewActivity} style={styles.nativeAccountRow}>
      <View style={[styles.nativeAccountIcon, index % 2 && { backgroundColor: '#E5F5EF' }]}>
        <Icon name={index % 2 ? 'trending-up-outline' : 'wallet-outline'} size={21} color={index % 2 ? colors.green : colors.blue} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={large ? undefined : 1}>{titleCase(account.account_type)}</Text>
        <Text style={styles.rowSub}>{account.account_number}</Text>
        {large && balance}
      </View>
      {!large && balance}
    </Pressable>
    <View style={styles.nativeAccountActions}>
      <LinkButton onPress={viewActivity} icon="arrow-forward">Activity</LinkButton>
      {!closed && <LinkButton onPress={() => { setTransferFrom(account.id); navigate('/transfer'); }}>Transfer</LinkButton>}
    </View>
  </Card>;
}
