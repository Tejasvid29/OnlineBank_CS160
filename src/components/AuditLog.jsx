import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { titleCase } from '../theme';
import { styles } from '../styles/appStyles';
import { useApp } from '../state/AppState';

const FIELD_LABELS = { first_name: 'First name', last_name: 'Last name', phone_number: 'Phone' };

function describe({ action, details = {} }) {
  const account = details.account_number ? `${titleCase(details.account_type)} ${details.account_number}` : '';
  switch (action) {
    case 'account_registered': return 'Registered a new account';
    case 'password_reset': return 'Password reset';
    case 'bank_account_opened': return `Opened ${account}`;
    case 'bank_account_closed': return `Closed ${account}`;
    case 'profile_updated': return Object.entries(details.changes || {})
      .map(([field, { from, to }]) => `${FIELD_LABELS[field] || titleCase(field)}: ${from || 'empty'} → ${to || 'empty'}`)
      .join('; ') || 'Profile updated';
    default: return titleCase(action);
  }
}

// A customer row that expands to show that customer's audit trail (manager only).
export default function CustomerAuditRow({ customer }) {
  const { auditLog, loadAuditLog } = useApp();
  const open = auditLog.customerId === customer.id;
  return <View style={styles.simpleRow}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${open ? 'Hide' : 'View'} audit log for ${customer.first_name} ${customer.last_name}`}
      onPress={() => open ? loadAuditLog(null) : loadAuditLog(customer.id)}
    >
      <Text style={styles.rowTitle}>{customer.first_name} {customer.last_name}</Text>
      <Text style={styles.rowSub}>{customer.id}</Text>
      <Text style={[styles.linkText, styles.linkButton]}>{open ? 'Hide audit log' : 'View audit log'}</Text>
    </Pressable>
    {open ? (auditLog.entries.length
      ? auditLog.entries.map((entry) => <View key={entry.id}>
        <Text style={styles.rowTitle}>{describe(entry)}</Text>
        <Text style={styles.rowSub}>{new Date(entry.created_at).toLocaleString()}</Text>
      </View>)
      : <Text style={styles.emptyText}>No audit entries.</Text>) : null}
  </View>;
}
