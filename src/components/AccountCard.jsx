import React from 'react';
import { Text, View } from 'react-native';
import { colors, money } from '../theme';
import { styles } from '../styles/appStyles';
import { Card, Divider, Icon, LinkButton, Status } from '../ui/primitives';
import { useApp } from '../state/AppState';

export function AccountCard({ account, index }) {
  const { compact, navigate, setSelectedAccount, setTransferFrom } = useApp();
  return <Card key={account.id} style={[styles.accountCard, compact && { width: '100%' }]}>
    <View style={styles.accountCardTop}>
      <View style={[styles.accountIcon, index % 2 && { backgroundColor: '#E5F5EF' }]}>
        <Icon name={index % 2 ? 'trending-up-outline' : 'wallet-outline'} size={23} color={index % 2 ? colors.green : colors.blue} />
      </View>
      <Status>{account.status || 'Active'}</Status>
    </View>
    <Text style={styles.accountName}>{account.account_type}</Text>
    <Text style={styles.accountNumber}>{account.account_number}</Text>
    <Text style={styles.balanceLabel}>Available balance</Text>
    <Text style={styles.balance}>{money(account.available ?? account.balance)}</Text>
    <Divider /><View style={styles.accountActions}>
      <LinkButton onPress={() => { setSelectedAccount(account.id); navigate('/activity'); }} icon="arrow-forward">View activity</LinkButton>
      {account.status !== 'closed' && <LinkButton onPress={() => { setTransferFrom(account.id); navigate('/transfer'); }}>Transfer</LinkButton>}
      </View>
  </Card>;
}
