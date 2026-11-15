import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { colors, money, titleCase } from '../src/theme';
import { apiConfigured } from '../src/services/api';
import { styles } from '../src/styles/appStyles';
import CustomerAuditRow from '../src/components/AuditLog';
import ReportBuilder from '../src/components/ReportBuilder';
import { Action, Card, Choice, Divider, Field, LinkButton, Notice, SectionHeading, Status } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

const REVIEW_FILTERS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([value, label]) => ({ value, label }));
const STATUS_COLORS = { pending: colors.blue, approved: colors.green, rejected: colors.red };
const customerName = (deposit) => `${deposit.customer?.first_name || ''} ${deposit.customer?.last_name || ''}`.trim() || 'Customer';
const accountLabel = (deposit) => `${titleCase(deposit.account?.account_type)} ${deposit.account?.account_number || ''}`.trim();

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
function CheckReviewDetail({ deposit }) {
  const { busy, profile, openCheckReview, reviewCheckDeposit } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState('');
  const pending = deposit.status === 'pending';
  const own = apiConfigured && deposit.customer_id === profile.id;
  const reload = () => openCheckReview(deposit.id);

  return <View style={styles.reportSummary}>
    <Text style={styles.rowTitle}>{money(deposit.amount)} from {customerName(deposit)}</Text>
    <Text style={styles.rowSub}>{accountLabel(deposit)}{deposit.account?.status && deposit.account.status !== 'activated' ? ' · Account closed' : ''} · Submitted {new Date(deposit.created_at).toLocaleString()}</Text>
    {deposit.customer?.email ? <Text style={styles.rowSub}>{deposit.customer.email}</Text> : null}
    {!pending && <Text style={styles.rowSub}>{titleCase(deposit.status)}{deposit.reviewed_at ? ` ${new Date(deposit.reviewed_at).toLocaleString()}` : ''}{deposit.review_notes ? ` · ${deposit.review_notes}` : ''}</Text>}
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

function CheckDepositReview() {
  const { checkReviewStatus, checkReviewList, checkReviewDetail, refreshCheckReviews, openCheckReview } = useApp();
  const openId = checkReviewDetail?.id;
  const opened = openId && { ...checkReviewList.find((item) => item.id === openId), ...checkReviewDetail };

  return <>
    <Choice label="Show" value={checkReviewStatus} options={REVIEW_FILTERS} onChange={refreshCheckReviews} />
    {checkReviewList.length ? checkReviewList.map((deposit) => <View key={deposit.id}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: deposit.id === openId }}
        accessibilityLabel={`${deposit.id === openId ? 'Hide' : 'Review'} ${money(deposit.amount)} check from ${customerName(deposit)}`}
        onPress={() => openCheckReview(deposit.id === openId ? null : deposit.id)}
        style={[styles.simpleRow, styles.accountServiceRow]}
      >
        <View style={styles.columnCard}>
          <Text style={styles.rowTitle}>{customerName(deposit)} · {money(deposit.amount)}</Text>
          <Text style={styles.rowSub}>{accountLabel(deposit)} · {new Date(deposit.created_at).toLocaleString()}</Text>
        </View>
        <Status color={STATUS_COLORS[deposit.status] || colors.blue}>{deposit.status}</Status>
      </Pressable>
      {deposit.id === openId && <CheckReviewDetail key={openId} deposit={opened} />}
    </View>) : <Text style={styles.emptyText}>{checkReviewStatus === 'pending' ? 'No checks are waiting for review.' : `No ${checkReviewStatus === 'all' ? '' : `${checkReviewStatus} `}check deposits.`}</Text>}
    <LinkButton onPress={() => refreshCheckReviews()} icon="refresh">Refresh</LinkButton>
  </>;
}

export default function Manager() {
  const { isManager, managerSearch, setManagerSearch, managerData, notice, noticeKind, compact } = useApp();

  if (!isManager) return <SectionHeading title="Access denied" subtitle="This page is available to authorized staff only." />;

  const query = managerSearch.toLowerCase();
  const customers = managerData.customers.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  const managedAccounts = managerData.accounts.filter((item) => JSON.stringify(item).toLowerCase().includes(query));

  return <>
    <SectionHeading title="Manager dashboard" subtitle="Authorized staff view" />
    <Notice text={notice} kind={noticeKind} />
    <View style={[styles.summaryRow, compact && styles.stack]}>
      <Card style={styles.summaryCard}><Text style={styles.miniLabel}>CUSTOMERS</Text><Text style={styles.summaryAmount}>{managerData.customers.length}</Text></Card>
      <Card style={styles.summaryCard}><Text style={styles.miniLabel}>ACCOUNTS</Text><Text style={styles.summaryAmount}>{managerData.accounts.length}</Text></Card>
    </View>
    <Card style={{ marginBottom: 16 }}>
      <Text style={styles.cardTitle}>Check deposits</Text>
      <CheckDepositReview />
    </Card>
    <Card>
      <Field label="Search customers and accounts" value={managerSearch} onChangeText={setManagerSearch} placeholder="Name, customer ID, or account ID" />
      <Divider />
      <Text style={styles.cardTitle}>Customers</Text>
      {customers.length ? customers.map((item, index) => <CustomerAuditRow customer={item} key={item.id || index} />) : <Text style={styles.emptyText}>No matching customers.</Text>}
      <Divider />
      <Text style={styles.cardTitle}>Accounts</Text>
      {managedAccounts.length ? managedAccounts.map((item, index) => <View style={styles.simpleRow} key={item.id || index}><Text style={styles.rowTitle}>{titleCase(item.account_type)} · {item.account_number || item.id}</Text><Text style={styles.rowSub}>{money(item.balance || 0)} · {titleCase(item.status)}</Text></View>) : <Text style={styles.emptyText}>No matching accounts.</Text>}
      <Divider />
      <Text style={styles.cardTitle}>Reports</Text>
      <ReportBuilder />
    </Card>
  </>;
}
