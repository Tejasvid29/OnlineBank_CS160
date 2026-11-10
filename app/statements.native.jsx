import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, dateLabel, money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { apiConfigured, bankingApi } from '../src/services/api';
import { Action, Card, Divider, Icon, LinkButton, Notice, SectionHeading } from '../src/ui/primitives';
import { Select } from '../src/ui/mobilePrimitives';
import { useApp } from '../src/state/AppState';

const periodLabel = (statement) => `${dateLabel(statement.period_start)} – ${dateLabel(statement.period_end)}`;

// Native statements: pick an account, generate a month-to-date statement, open any saved one.
export default function Statements() {
  const { accounts, accountOptions } = useApp();
  const [accountId, setAccountId] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);
  const [notice, setNotice] = useState({ text: '', kind: 'error' });
  const [busy, setBusy] = useState(false);

  const selected = accountId || accountOptions[0]?.value || '';
  const account = accounts.find((item) => item.id === selected);

  async function loadList(id = selected) {
    if (!id || !apiConfigured) return;
    try { setList((await bankingApi.statements(id)).statements || []); }
    catch (error) { setNotice({ text: error.message, kind: 'error' }); }
  }

  useEffect(() => { setOpen(null); loadList(selected); }, [selected]);

  async function generate() {
    setBusy(true); setNotice({ text: '', kind: 'error' });
    try {
      const { statement } = await bankingApi.generateStatement(selected);
      setOpen(statement);
      await loadList();
      setNotice({ text: `Statement generated through ${dateLabel(statement.period_end)}.`, kind: 'success' });
    } catch (error) { setNotice({ text: error.message, kind: 'error' }); }
    finally { setBusy(false); }
  }

  async function view(id) {
    setNotice({ text: '', kind: 'error' });
    try { setOpen((await bankingApi.statement(id)).statement); }
    catch (error) { setNotice({ text: error.message, kind: 'error' }); }
  }

  if (!apiConfigured) return <>
    <SectionHeading title="Statements" />
    <Notice text="Statements need the banking server. They are not available in the demo." />
  </>;

  if (!accountOptions.length) return <>
    <SectionHeading title="Statements" />
    <Notice text="Open an account to see statements." />
  </>;

  if (open) return <>
    <SectionHeading title="Statement" subtitle={`${titleCase(account?.account_type)} ${account?.account_number}`} />
    <LinkButton onPress={() => setOpen(null)} icon="arrow-back-outline">Back to statements</LinkButton>
    <Notice text={notice.text} kind={notice.kind} />
    <Card>
      <Text style={styles.rowSub}>{periodLabel(open)}</Text>
      <Divider />
      {[['Opening balance', open.opening_balance], ['Deposits', open.total_deposits], ['Withdrawals', -open.total_withdrawals], ['Closing balance', open.closing_balance]].map(([label, value]) =>
        <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}><Text style={styles.rowSub}>{label}</Text><Text style={styles.rowTitle}>{money(value)}</Text></View>)}
    </Card>
    <Text style={styles.nativeCount}>{open.transaction_count} {open.transaction_count === 1 ? 'transaction' : 'transactions'}</Text>
    <Card style={styles.nativeListCard}>
      {(open.transactions || []).length ? open.transactions.map((line, index) => <View key={`${line.date}-${index}`} style={styles.simpleRow}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{line.description}</Text><Text style={styles.rowSub}>{dateLabel(line.date)}</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text style={styles.transactionAmount}>{money(line.amount)}</Text><Text style={styles.rowSub}>{money(line.balance)}</Text></View>
        </View>
      </View>) : <Text style={styles.emptyText}>No transactions this period.</Text>}
    </Card>
  </>;

  return <>
    <SectionHeading title="Statements" subtitle="Generate one for this month so far. A full statement is also created and emailed at the end of every month." />
    <Notice text={notice.text} kind={notice.kind} />
    <Select label="Account" value={selected} options={accountOptions} onChange={setAccountId} />
    <Action onPress={generate} disabled={busy} icon="document-text-outline">{busy ? 'Generating…' : 'Generate statement up to today'}</Action>
    <Text style={styles.nativeCount}>{list.length} saved {list.length === 1 ? 'statement' : 'statements'}</Text>
    <Card style={styles.nativeListCard}>
      {list.length ? list.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => view(item.id)} style={styles.paymentRow}>
        <View style={styles.paymentIcon}><Icon name="document-text-outline" size={19} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{item.kind === 'monthly' ? 'Monthly statement' : 'Month to date'}</Text>
          <Text style={styles.rowSub}>{periodLabel(item)}</Text>
        </View>
        <Text style={styles.transactionAmount}>{money(item.closing_balance)}</Text>
      </Pressable>) : <Text style={styles.emptyText}>No statements yet. Generate one above.</Text>}
    </Card>
  </>;
}
