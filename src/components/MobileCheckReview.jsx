import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiConfigured } from '../services/api';
import { colors, dateLabel, money, titleCase } from '../theme';
import { styles } from '../styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, Notice, Status } from '../ui/primitives';
import { Select } from '../ui/mobilePrimitives';
import { useApp } from '../state/AppState';

// Manager check review for the native Manager screen (app/manager.native.jsx). Not a .native file because Expo
// Router's web build also bundles app/*.native.jsx, so its imports must resolve on web too. The web screen has its
// own review section in app/manager.jsx; both use the same AppState actions.

const FILTERS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([value, label]) => ({ value, label }));
const STATUS_COLORS = { pending: colors.blue, approved: colors.green, rejected: colors.red };
const customerName = (deposit) => `${deposit.customer?.first_name || ''} ${deposit.customer?.last_name || ''}`.trim() || 'Customer';
const accountLabel = (deposit) => `${titleCase(deposit.account?.account_type)} ${deposit.account?.account_number || ''}`.trim();
const when = (value) => `${dateLabel(value)}, ${new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

function DetailRow({ label, value }) {
  return <View style={styles.nativeReviewRow}>
    <Text style={styles.rowSub}>{label}</Text>
    <Text style={[styles.rowTitle, styles.nativeReviewValue]}>{value}</Text>
  </View>;
}

// One side of the check. uri is undefined while the signed link loads and null when it couldn't be created.
function CheckPhoto({ label, uri, onFail, onEnlarge }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const show = uri && !failed;
  return <View style={styles.nativeCell}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {show
      ? <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${label} of the check`} accessibilityHint="Shows the image larger" onPress={() => onEnlarge({ label, uri })}>
        <Image source={{ uri }} style={styles.nativeCheckThumb} resizeMode="contain" onError={() => { setFailed(true); onFail(); }} />
      </Pressable>
      : <View style={[styles.nativeCheckPlaceholder, styles.nativeCheckMissing]} accessible accessibilityLabel={`${label} of the check: ${uri === undefined ? 'loading' : 'image unavailable'}`}>
        <Icon name={uri === undefined ? 'hourglass-outline' : 'image-outline'} size={20} color={colors.muted} />
        <Text style={styles.rowSub}>{uri === undefined ? 'Loading…' : 'Unavailable'}</Text>
      </View>}
  </View>;
}

// Full-screen view of one image, over the details sheet. iOS supports pinch to zoom inside a ScrollView.
function EnlargedPhoto({ photo, onClose }) {
  return <View style={styles.nativeZoom}>
    <View style={styles.nativeZoomHeader}>
      <Text style={styles.nativeZoomTitle}>{photo.label} of check</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close enlarged image" onPress={onClose} hitSlop={10}><Icon name="close" size={28} color={colors.white} /></Pressable>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} maximumZoomScale={4} minimumZoomScale={1} centerContent>
      <Image source={{ uri: photo.uri }} style={styles.nativeZoomImage} resizeMode="contain" accessibilityLabel={`${photo.label} of the check, enlarged`} />
    </ScrollView>
  </View>;
}

function DetailSheet({ deposit }) {
  const { busy, profile, notice, noticeKind, managerData, openCheckReview, reviewCheckDeposit } = useApp();
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState(null);
  const [expired, setExpired] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = deposit.status === 'pending';
  const own = apiConfigured && deposit.customer_id === profile.id;
  const close = () => openCheckReview(null);

  // Signed image links stop working after image_url_expires_in seconds; offer a reload from then on.
  useEffect(() => {
    setExpired(false); setFailed(false);
    if (!deposit.image_url_expires_in) return undefined;
    const timer = setTimeout(() => setExpired(true), deposit.image_url_expires_in * 1000);
    return () => clearTimeout(timer);
  }, [deposit.front_image_url, deposit.image_url_expires_in]);

  const reviewer = deposit.reviewed_by && (deposit.reviewed_by === profile.id ? 'You'
    : (({ first_name, last_name } = {}) => `${first_name || ''} ${last_name || ''}`.trim())(managerData.customers.find((item) => item.id === deposit.reviewed_by)) || 'Another manager');

  function approve() {
    Alert.alert('Approve this check?', `${money(deposit.amount)} will be credited to ${accountLabel(deposit)} for ${customerName(deposit)}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => reviewCheckDeposit(deposit, 'approve') },
    ]);
  }

  return <SafeAreaView style={styles.nativeModal} edges={['top', 'bottom']}>
    <View style={styles.notificationHeading}>
      <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Check deposit</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close check details" onPress={close} hitSlop={8}><Icon name="close-outline" size={26} color={colors.ink} /></Pressable>
    </View>
    {/* iOS moves the content above the keyboard itself; Android resizes the modal window. */}
    <ScrollView contentContainerStyle={styles.nativeContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      {/* The toast sits under this modal, so messages show here while it is open. */}
      <Notice text={notice} kind={noticeKind} />
      <View style={styles.nativeReviewHeading}>
        <Text style={styles.nativeReviewAmount}>{money(deposit.amount)}</Text>
        <Status color={STATUS_COLORS[deposit.status] || colors.blue}>{deposit.status}</Status>
      </View>
      <Card style={styles.nativeListCard}>
        <DetailRow label="Customer" value={customerName(deposit)} />
        {deposit.customer?.email ? <DetailRow label="Email" value={deposit.customer.email} /> : null}
        <DetailRow label="Account" value={`${accountLabel(deposit)}${deposit.account?.status && deposit.account.status !== 'activated' ? ' (closed)' : ''}`} />
        <DetailRow label="Submitted" value={when(deposit.created_at)} />
        {deposit.reviewed_at ? <DetailRow label={`${titleCase(deposit.status)}`} value={when(deposit.reviewed_at)} /> : null}
        {reviewer ? <DetailRow label="Reviewed by" value={reviewer} /> : null}
        {deposit.review_notes ? <DetailRow label="Notes" value={deposit.review_notes} /> : null}
      </Card>

      <View style={styles.nativeRow2}>
        <CheckPhoto label="Front" uri={deposit.front_image_url} onFail={() => setFailed(true)} onEnlarge={setPhoto} />
        <CheckPhoto label="Back" uri={deposit.back_image_url} onFail={() => setFailed(true)} onEnlarge={setPhoto} />
      </View>
      {(expired || failed || deposit.front_image_url === null || deposit.back_image_url === null) && apiConfigured
        ? <LinkButton onPress={() => openCheckReview(deposit.id)} icon="refresh">{expired ? 'Image links expired. Reload images' : 'Reload images'}</LinkButton>
        : <Text style={styles.nativeHint}>Tap an image to view it larger.</Text>}

      {pending && (own
        ? <Card style={[styles.nativeCard, styles.infoCard, { marginTop: 16 }]}>
          <Icon name="information-circle-outline" size={22} />
          <Text style={[styles.bodyText, { flex: 1 }]}>You can't review your own check deposit. Ask another manager.</Text>
        </Card>
        : <View style={styles.nativeReviewActions}>
          <Action icon="checkmark-circle-outline" disabled={busy} onPress={approve} style={styles.nativeFullAction} accessibilityLabel={`Approve ${money(deposit.amount)} check from ${customerName(deposit)}`}>Approve {money(deposit.amount)}</Action>
          <Field label="Reason for rejecting" value={notes} onChangeText={setNotes} placeholder="For example: signature missing" autoCapitalize="sentences" accessibilityHint="Required to reject this check" />
          <Action variant="secondary" icon="close-circle-outline" disabled={busy} onPress={() => reviewCheckDeposit(deposit, 'reject', notes)} style={styles.nativeFullAction} accessibilityLabel={`Reject ${money(deposit.amount)} check from ${customerName(deposit)}`}>Reject check</Action>
        </View>)}
    </ScrollView>
    {photo && <EnlargedPhoto photo={photo} onClose={() => setPhoto(null)} />}
  </SafeAreaView>;
}

// The Checks tab: status filter, the list, and the details sheet for the check that is open.
export default function MobileCheckReview() {
  const { checkReviewStatus, checkReviewList, checkReviewDetail, refreshCheckReviews, openCheckReview } = useApp();
  const openId = checkReviewDetail?.id;
  const opened = openId ? { ...checkReviewList.find((item) => item.id === openId), ...checkReviewDetail } : null;
  const empty = checkReviewStatus === 'pending' ? 'No checks are waiting for review.' : `No ${checkReviewStatus === 'all' ? '' : `${checkReviewStatus} `}check deposits.`;

  return <>
    <Select label="Show" value={checkReviewStatus} options={FILTERS} onChange={refreshCheckReviews} />
    <Text style={styles.nativeCount}>{checkReviewList.length} {checkReviewList.length === 1 ? 'check' : 'checks'} · Pull down to refresh</Text>
    <Card style={styles.nativeListCard}>
      {checkReviewList.length ? checkReviewList.map((deposit) => <Pressable
        key={deposit.id}
        accessibilityRole="button"
        accessibilityLabel={`${customerName(deposit)}, ${money(deposit.amount)}, ${accountLabel(deposit)}, submitted ${dateLabel(deposit.created_at)}, ${deposit.status}`}
        accessibilityHint="Opens the check details"
        onPress={() => openCheckReview(deposit.id)}
        style={({ pressed }) => [styles.nativeCheckRow, pressed && styles.pressed]}
      >
        <View style={styles.nativeCell}>
          <Text style={styles.rowTitle} numberOfLines={1}>{customerName(deposit)}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{accountLabel(deposit)} · {dateLabel(deposit.created_at)}</Text>
        </View>
        <View style={styles.nativeCheckRowRight}>
          <Text style={styles.transactionAmount}>{money(deposit.amount)}</Text>
          <Status color={STATUS_COLORS[deposit.status] || colors.blue}>{deposit.status}</Status>
        </View>
      </Pressable>) : <Text style={styles.emptyText}>{empty}</Text>}
    </Card>
    <Modal visible={Boolean(opened)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => openCheckReview(null)}>
      {opened && <DetailSheet key={openId} deposit={opened} />}
    </Modal>
  </>;
}
