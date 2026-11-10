import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, dateLabel, money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { apiConfigured, bankingApi } from '../src/services/api';
import { Action, Card, Choice, Divider, Icon, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

const periodLabel = (statement) => `${dateLabel(statement.period_start)} – ${dateLabel(statement.period_end)}`;

export default function Statements() {
  const { accounts, accountOptions, compact } = useApp();
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

  return <>
    <SectionHeading title="Statements" subtitle="Generate a statement for this month so far. A full statement for each account is also created and emailed at the end of every month." />
    <Notice text={notice.text} kind={notice.kind} />
    {!apiConfigured ? <Notice text="Statements need the banking server. They are not available in the demo." />
      : !accountOptions.length ? <Notice text="Open an account to see statements." />
      : <View style={[styles.twoColumns, compact && styles.stack]}>
        <Card style={styles.columnCard}>
          <Choice label="Account" value={selected} options={accountOptions} onChange={setAccountId} />
          <Action onPress={generate} disabled={busy} icon="document-text-outline">{busy ? 'Generating…' : 'Generate statement up to today'}</Action>
          <Divider />
          <Text style={styles.cardTitle}>Saved statements</Text>
          {list.length ? list.map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => view(item.id)} style={[styles.paymentRow, open?.id === item.id && { backgroundColor: colors.sky }]}>
            <View style={styles.paymentIcon}><Icon name="document-text-outline" size={19} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.kind === 'monthly' ? 'Monthly statement' : 'Month to date'}</Text>
              <Text style={styles.rowSub}>{periodLabel(item)}</Text>
            </View>
            <Text style={styles.transactionAmount}>{money(item.closing_balance)}</Text>
          </Pressable>) : <Text style={styles.emptyText}>No statements yet. Generate one above.</Text>}
        </Card>
        <Card style={styles.columnCard}>
          {open ? <>
            <Text style={styles.cardTitle}>{titleCase(account?.account_type)} {account?.account_number}</Text>
            <Text style={styles.rowSub}>{periodLabel(open)}</Text>
            <Divider />
            {[['Opening balance', open.opening_balance], ['Deposits', open.total_deposits], ['Withdrawals', -open.total_withdrawals], ['Closing balance', open.closing_balance]].map(([label, value]) =>
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}><Text style={styles.rowSub}>{label}</Text><Text style={styles.rowTitle}>{money(value)}</Text></View>)}
            <Divider />
            <Text style={styles.rowTitle}>{open.transaction_count} transaction{open.transaction_count === 1 ? '' : 's'}</Text>
            {(open.transactions || []).map((line, index) => <View key={`${line.date}-${index}`} style={styles.simpleRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{line.description}</Text><Text style={styles.rowSub}>{dateLabel(line.date)}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={styles.transactionAmount}>{money(line.amount)}</Text><Text style={styles.rowSub}>{money(line.balance)}</Text></View>
              </View>
            </View>)}
            {typeof window !== 'undefined' && <Action variant="secondary" onPress={() => window.print()} icon="print-outline">Print or save as PDF</Action>}
          </> : <Text style={styles.emptyText}>Select a statement to view it.</Text>}
        </Card>
      </View>}
  </>;
}
