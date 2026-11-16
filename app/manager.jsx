import React, { useState } from 'react';
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { accountSearchValues, checkSearchValues, colors, customerSearchValues, dateLabel, matchesWords, money, searchWords, titleCase } from '../src/theme';
import { apiConfigured } from '../src/services/api';
import { styles } from '../src/styles/appStyles';
import { AuditEntries } from '../src/components/AuditLog';
import ReportBuilder from '../src/components/ReportBuilder';
import { Action, Card, Choice, Divider, Field, Icon, LinkButton, Notice, Status } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

// Web manager dashboard: summary cards, then Checks / Customers / Accounts / Reports tabs (the phone's Manager screen
// has the same four). Tabs stay mounted while hidden, so searches, filters and an open review survive switching.

const REVIEW_FILTERS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([value, label]) => ({ value, label }));
const STATUS_COLORS = { pending: colors.blue, approved: colors.green, rejected: colors.red };
const options = (pairs) => pairs.map(([value, label]) => ({ value, label }));
const ACCOUNT_TYPES = options([['all', 'All'], ['checking', 'Checking'], ['savings', 'Savings']]);
const ACCOUNT_STATUSES = options([['all', 'All'], ['activated', 'Open'], ['deactivated', 'Closed']]);
const ACCOUNT_SORTS = options([['newest', 'Newest'], ['highest', 'Highest balance'], ['lowest', 'Lowest balance']]);
// The two-pane check review needs room for the list and the images side by side (the sidebar takes 232 of it).
const TWO_PANE_WIDTH = 1100;
const HIDDEN = { display: 'none' };

const customerName = (deposit) => `${deposit.customer?.first_name || ''} ${deposit.customer?.last_name || ''}`.trim() || 'Customer';
const accountLabel = (deposit) => `${titleCase(deposit.account?.account_type)} ${deposit.account?.account_number || ''}`.trim();
const personName = (person) => `${person?.first_name || ''} ${person?.last_name || ''}`.trim() || 'Unknown customer';
const isOpen = (account) => account.status === 'activated';
// The review list holds up to 100 checks per status, so a full pending list may mean more are waiting.
const pendingLabel = (count) => count >= 100 ? '100+' : String(count);

function CheckImage({ label, uri, onReload }) {
  const [failed, setFailed] = useState(false);
  return <View style={styles.checkImageCell}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {uri && !failed
      ? <Image source={{ uri }} style={styles.checkImage} resizeMode="contain" accessibilityLabel={`${label} of the check`} onError={() => setFailed(true)} />
      : <View style={[styles.checkImage, styles.checkImageMissing]}>
        <Text style={styles.rowSub}>{uri === undefined ? 'Loading image…' : 'Image unavailable.'}</Text>
        {uri !== undefined && <LinkButton onPress={onReload}>Reload images</LinkButton>}
      </View>}
  </View>;
}

// One deposit opened for review: both images, then approve (with a confirmation) or reject (reason required).
// Inline under its row on narrower windows; in the right-hand pane (pane) on wide ones.
function CheckReviewDetail({ deposit, pane = false }) {
  const { busy, profile, openCheckReview, reviewCheckDeposit } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState('');
  const pending = deposit.status === 'pending';
  const own = apiConfigured && deposit.customer_id === profile.id;
  const reload = () => openCheckReview(deposit.id);

  return <View style={pane ? null : styles.reportSummary}>
    <View style={styles.managerDetailHeading}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={pane ? styles.asideAmount : styles.rowTitle}>{money(deposit.amount)} from {customerName(deposit)}</Text>
        <Text style={styles.rowSub}>{accountLabel(deposit)}{deposit.account?.status && deposit.account.status !== 'activated' ? ' · Account closed' : ''} · Submitted {new Date(deposit.created_at).toLocaleString()}</Text>
        {deposit.customer?.email ? <Text style={styles.rowSub}>{deposit.customer.email}</Text> : null}
        {!pending && <Text style={styles.rowSub}>{titleCase(deposit.status)}{deposit.reviewed_at ? ` ${new Date(deposit.reviewed_at).toLocaleString()}` : ''}{deposit.review_notes ? ` · ${deposit.review_notes}` : ''}</Text>}
      </View>
      <Status color={STATUS_COLORS[deposit.status] || colors.blue}>{deposit.status}</Status>
    </View>
    <Divider />
    <View style={styles.checkImages}>
      <CheckImage key={`front-${deposit.front_image_url}`} label="Front" uri={deposit.front_image_url} onReload={reload} />
      <CheckImage key={`back-${deposit.back_image_url}`} label="Back" uri={deposit.back_image_url} onReload={reload} />
    </View>
    {apiConfigured && deposit.image_url_expires_in ? <Text style={styles.rowSub}>Image links expire after {Math.round(deposit.image_url_expires_in / 60)} minutes.</Text> : null}
    {pending && (own
      ? <Text style={styles.bodyText}>You can't review your own check deposit. Ask another manager.</Text>
      : <>
        <Divider />
        {confirming ? <View style={styles.accountServiceActions}>
          <Text style={styles.rowSub}>Credit {money(deposit.amount)} to {accountLabel(deposit)}?</Text>
          <Action disabled={busy} onPress={() => reviewCheckDeposit(deposit, 'approve')} accessibilityLabel={`Confirm approval of ${money(deposit.amount)} check from ${customerName(deposit)}`}>Confirm approval</Action>
          <LinkButton onPress={() => setConfirming(false)}>Cancel</LinkButton>
        </View> : <Action icon="checkmark-circle-outline" disabled={busy} onPress={() => setConfirming(true)}>Approve {money(deposit.amount)}</Action>}
        <Divider />
        <Field label="Reason for rejecting" value={notes} onChangeText={setNotes} placeholder="For example: signature missing" autoCapitalize="sentences" />
        <Action variant="secondary" disabled={busy} onPress={() => reviewCheckDeposit(deposit, 'reject', notes)}>Reject check</Action>
      </>)}
    <LinkButton onPress={() => openCheckReview(null)}>Close</LinkButton>
  </View>;
}

function ChecksTab({ wide }) {
  const { checkReviewStatus, checkReviewList, checkReviewDetail, refreshCheckReviews, openCheckReview } = useApp();
  const openId = checkReviewDetail?.id;
  const opened = openId && { ...checkReviewList.find((item) => item.id === openId), ...checkReviewDetail };
  const [search, setSearch] = useState('');
  const words = searchWords(search);
  const shown = words.length ? checkReviewList.filter((deposit) => matchesWords(words, checkSearchValues(deposit))) : checkReviewList;
  const empty = words.length ? 'No check deposits match your search.' : checkReviewStatus === 'pending' ? 'No checks are waiting for review.' : `No ${checkReviewStatus === 'all' ? '' : `${checkReviewStatus} `}check deposits.`;

  const list = <>
    <Choice label="Show" value={checkReviewStatus} options={REVIEW_FILTERS} onChange={refreshCheckReviews} />
    <Field label="Search check deposits" value={search} onChangeText={setSearch} placeholder="Name, email, account number or amount" />
    <Text style={[styles.rowSub, { marginBottom: 8 }]}>{words.length ? `${shown.length} of ${checkReviewList.length}` : checkReviewList.length} {checkReviewList.length === 1 ? 'check' : 'checks'}</Text>
    {shown.length ? shown.map((deposit) => {
      const selected = deposit.id === openId;
      return <View key={deposit.id}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={wide ? { selected } : { expanded: selected }}
          accessibilityLabel={`${selected ? 'Hide' : 'Review'} ${money(deposit.amount)} check from ${customerName(deposit)}`}
          onPress={() => openCheckReview(selected ? null : deposit.id)}
          style={[styles.managerRow, selected && styles.managerRowSelected]}
        >
          <View style={styles.columnCard}>
            <Text style={styles.rowTitle}>{customerName(deposit)} · {money(deposit.amount)}</Text>
            <Text style={styles.rowSub}>{accountLabel(deposit)} · {new Date(deposit.created_at).toLocaleString()}</Text>
          </View>
          <Status color={STATUS_COLORS[deposit.status] || colors.blue}>{deposit.status}</Status>
        </Pressable>
        {!wide && selected && <CheckReviewDetail key={openId} deposit={opened} />}
      </View>;
    }) : <Text style={styles.emptyText}>{empty}</Text>}
    <LinkButton onPress={() => refreshCheckReviews()} icon="refresh">Refresh checks</LinkButton>
  </>;

  if (!wide) return <Card>{list}</Card>;
  return <View style={styles.twoColumns}>
    <Card style={styles.columnCard}>{list}</Card>
    <Card style={[styles.columnCard, { flex: 1.4 }]}>
      {opened ? <CheckReviewDetail key={openId} deposit={opened} pane /> : <View style={styles.managerPanePlaceholder}>
        <Icon name="document-text-outline" size={32} color={colors.muted} />
        <Text style={styles.bodyText}>Select a check on the left to review it.</Text>
      </View>}
    </Card>
  </View>;
}

// A customer, expanding to their accounts and audit log. Opening one closes the previous (one audit log loads at a time).
function CustomerRow({ customer }) {
  const { auditLog, loadAuditLog, managerData } = useApp();
  const open = auditLog.customerId === customer.id;
  const owned = managerData.accounts.filter((account) => account.users?.id === customer.id);
  const details = [customer.email, customer.zip_code && `ZIP ${customer.zip_code}`, customer.created_at && `Joined ${dateLabel(customer.created_at)}`].filter(Boolean).join(' · ');
  return <View>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${open ? 'Hide' : 'Show'} accounts and audit log for ${personName(customer)}`}
      onPress={() => loadAuditLog(open ? null : customer.id)}
      style={[styles.managerRow, open && styles.managerRowSelected]}
    >
      <View style={styles.columnCard}>
        <Text style={styles.rowTitle}>{personName(customer)}</Text>
        {details ? <Text style={styles.rowSub}>{details}</Text> : null}
        <Text style={styles.rowSub}>{customer.id}</Text>
      </View>
      <View style={styles.managerRowRight}>
        {customer.role === 'admin' && <Status color={colors.blue}>manager</Status>}
        {customer.status && <Status color={customer.status === 'active' ? colors.green : colors.muted}>{customer.status}</Status>}
      </View>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
    </Pressable>
    {open && <View style={styles.managerDetails}>
      <Text style={styles.miniLabel}>ACCOUNTS</Text>
      {owned.length ? owned.map((account) => <Text key={account.id} style={styles.rowSub}>
        {titleCase(account.account_type)} {account.account_number} · {money(account.balance || 0)} · {isOpen(account) ? 'Open' : 'Closed'}
      </Text>) : <Text style={styles.rowSub}>No accounts.</Text>}
      <Text style={[styles.miniLabel, { marginTop: 8 }]}>AUDIT LOG</Text>
      <AuditEntries entries={auditLog.entries} />
    </View>}
  </View>;
}

function CustomersTab() {
  const { managerSearch, setManagerSearch, managerData } = useApp();
  const words = searchWords(managerSearch);
  const customers = managerData.customers.filter((item) => matchesWords(words, customerSearchValues(item)));
  return <Card>
    <Field label="Search customers" value={managerSearch} onChangeText={setManagerSearch} placeholder="Name, email, ZIP code or customer ID" />
    <Text style={[styles.rowSub, { marginBottom: 8 }]}>{words.length ? `${customers.length} of ${managerData.customers.length}` : managerData.customers.length} customers</Text>
    {customers.length ? customers.map((item, index) => <CustomerRow customer={item} key={item.id || index} />) : <Text style={styles.emptyText}>No matching customers.</Text>}
  </Card>;
}

function AccountsTab() {
  const { managerSearch, setManagerSearch, managerData } = useApp();
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const words = searchWords(managerSearch);
  const order = {
    newest: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
    highest: (a, b) => Number(b.balance || 0) - Number(a.balance || 0),
    lowest: (a, b) => Number(a.balance || 0) - Number(b.balance || 0),
  }[sort];
  const accounts = managerData.accounts
    .filter((item) => (type === 'all' || item.account_type === type) && (status === 'all' || item.status === status) && matchesWords(words, accountSearchValues(item)))
    .sort(order);
  return <Card>
    <Field label="Search accounts" value={managerSearch} onChangeText={setManagerSearch} placeholder="Account number, owner, ZIP code or account ID" />
    <View style={styles.filterGrid}>
      <View style={styles.filterCell}><Choice label="Type" value={type} options={ACCOUNT_TYPES} onChange={setType} /></View>
      <View style={styles.filterCell}><Choice label="Status" value={status} options={ACCOUNT_STATUSES} onChange={setStatus} /></View>
      <View style={styles.filterCell}><Choice label="Sort" value={sort} options={ACCOUNT_SORTS} onChange={setSort} /></View>
    </View>
    <Text style={[styles.rowSub, { marginBottom: 8 }]}>{accounts.length} of {managerData.accounts.length} accounts</Text>
    {accounts.length ? accounts.map((item, index) => <View key={item.id || index} style={styles.managerRow}>
      <View style={styles.columnCard}>
        <Text style={styles.rowTitle}>{personName(item.users)}</Text>
        <Text style={styles.rowSub}>{titleCase(item.account_type)} · {item.account_number || item.id}{item.created_at ? ` · Opened ${dateLabel(item.created_at)}` : ''}</Text>
      </View>
      <View style={styles.managerRowRight}>
        <Text style={styles.transactionAmount}>{money(item.balance || 0)}</Text>
        <Status color={isOpen(item) ? colors.green : colors.muted}>{isOpen(item) ? 'open' : 'closed'}</Status>
      </View>
    </View>) : <Text style={styles.emptyText}>No matching accounts.</Text>}
  </Card>;
}

function ManagerTabs({ tabs, value, onChange }) {
  return <View accessibilityRole="tablist" style={styles.managerTabs}>
    {tabs.map(([tab, label, count]) => {
      const active = tab === value;
      return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={count ? `${label}, ${count} waiting` : label} onPress={() => onChange(tab)} style={[styles.managerTab, active && styles.managerTabActive]}>
        <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
        {count ? <View style={styles.managerTabCount}><Text style={styles.managerTabCountText}>{count}</Text></View> : null}
      </Pressable>;
    })}
  </View>;
}

function SummaryCard({ label, value, caption, onPress }) {
  const body = <Card style={[styles.summaryCard, styles.managerSummaryCard]}>
    <Text style={styles.miniLabel}>{label}</Text>
    <Text style={styles.summaryAmount}>{value}</Text>
    <Text style={styles.summaryCaption}>{caption}</Text>
  </Card>;
  return onPress
    ? <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}. ${caption}`} onPress={onPress} style={({ pressed }) => [styles.managerSummaryCard, pressed && styles.pressed]}>{body}</Pressable>
    : <View style={styles.managerSummaryCard}>{body}</View>;
}

export default function Manager() {
  const { isManager, managerData, notice, noticeKind, busy, checkPendingCount, refreshManager } = useApp();
  const { width } = useWindowDimensions();
  // Until a tab is picked: Checks while any wait for review, otherwise Customers.
  const [chosen, setChosen] = useState(null);

  if (!isManager) return <View style={styles.sectionHeading}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Access denied</Text><Text style={styles.subtitle}>This page is available to authorized staff only.</Text></View></View>;

  const pending = checkPendingCount || 0;
  const tab = chosen ?? (pending > 0 ? 'checks' : 'customers');
  const openAccounts = managerData.accounts.filter(isOpen).length;
  const totalBalance = managerData.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const tabs = [['checks', 'Checks', pending ? pendingLabel(pending) : null], ['customers', 'Customers'], ['accounts', 'Accounts'], ['reports', 'Reports']];

  return <>
    <View style={styles.sectionHeading}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>Manager dashboard</Text>
        <Text style={styles.subtitle}>Authorized staff view</Text>
      </View>
      {apiConfigured && <Action variant="secondary" icon="refresh-outline" disabled={busy} onPress={refreshManager}>Refresh</Action>}
    </View>
    <Notice text={notice} kind={noticeKind} />

    <View style={[styles.summaryRow, { flexWrap: 'wrap' }]}>
      <SummaryCard label="CUSTOMERS" value={managerData.customers.length} caption="Registered profiles" />
      <SummaryCard label="ACCOUNTS" value={managerData.accounts.length} caption={`${openAccounts} open · ${managerData.accounts.length - openAccounts} closed`} />
      <SummaryCard label="TOTAL BALANCES" value={money(totalBalance)} caption="Across all accounts" />
      <SummaryCard
        label="CHECKS TO REVIEW"
        value={checkPendingCount === null ? '—' : pendingLabel(pending)}
        caption={pending ? 'Open the review queue' : checkPendingCount === null ? 'Not loaded yet' : 'None waiting'}
        onPress={() => setChosen('checks')}
      />
    </View>

    <ManagerTabs tabs={tabs} value={tab} onChange={setChosen} />
    <View style={tab !== 'checks' && HIDDEN}><ChecksTab wide={width >= TWO_PANE_WIDTH} /></View>
    <View style={tab !== 'customers' && HIDDEN}><CustomersTab /></View>
    <View style={tab !== 'accounts' && HIDDEN}><AccountsTab /></View>
    <View style={tab !== 'reports' && HIDDEN}><Card><ReportBuilder split={width >= TWO_PANE_WIDTH} /></Card></View>
  </>;
}
