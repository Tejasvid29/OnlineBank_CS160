import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { apiConfigured } from '../src/services/api';
import { colors, dateLabel, isActivated, money, titleCase } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, SectionHeading } from '../src/ui/primitives';
import { Select } from '../src/ui/mobilePrimitives';
import { useApp } from '../src/state/AppState';
import { discardCheckPhoto } from '../src/services/checkPhotoCache';

const STEPS = ['details', 'front', 'back', 'review'];
const STEP_NAMES = { details: 'Account and amount', front: 'Front of check', back: 'Back of check', review: 'Review' };
const SIDES = {
  front: { title: 'Photograph the front', tip: 'Place the check on a dark, flat surface in good light. Fit all four corners in the frame.' },
  back: { title: 'Photograph the back', tip: 'Sign the back and write “For mobile deposit only at CS160 Bank” before you take the photo.' },
};

// Native check deposit: account and amount → front photo → back photo → review → submit.
// Web keeps app/checks.jsx, which explains that deposits are mobile only.
export default function Checks() {
  const { accounts, busy, checkDeposits, depositError, submitDeposit, setNotice, navigate, setSelectedAccount } = useApp();
  const open = accounts.filter(isActivated);
  const [step, setStep] = useState('details');
  const [accountId, setAccountId] = useState(open[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [photos, setPhotos] = useState({ front: null, back: null });
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const account = accounts.find((item) => item.id === accountId);
  const options = open.map((item) => ({ value: item.id, label: `${titleCase(item.account_type)} ${item.account_number}`, detail: `Balance ${money(item.balance)}` }));

  function reset() {
    void discardCheckPhoto(photos.front);
    void discardCheckPhoto(photos.back);
    setStep('details'); setAmount(''); setPhotos({ front: null, back: null }); setSubmitted(null);
  }

  async function usePhoto(side, asset) {
    if (!asset?.uri) { setNotice(`The ${side} photo could not be read. Retake it.`); return; }
    if (asset.fileSize > 10 * 1024 * 1024) { setNotice(`The ${side} photo is too large. Retake it under 10 MB.`); await discardCheckPhoto(asset); return; }
    if (asset.width && asset.height && (Math.min(asset.width, asset.height) < 400 || Math.max(asset.width, asset.height) < 800)) {
      setNotice(`The ${side} photo is too small. Retake it with the full check visible.`);
      await discardCheckPhoto(asset);
      return;
    }
    const previous = photos[side];
    setNotice('');
    setPhotos((current) => ({ ...current, [side]: asset }));
    if (previous?.uri !== asset.uri) await discardCheckPhoto(previous);
  }

  async function capture(side) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraBlocked(true);
      if (!permission.canAskAgain) Alert.alert('Camera access is off', 'Allow camera access for CS160 Bank in Settings to photograph your check.', [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]);
      return;
    }
    setCameraBlocked(false);
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false });
      if (!result.canceled) await usePhoto(side, result.assets[0]);
    } catch { setNotice('The camera is not available on this device.'); }
  }

  // Demo only: lets the flow be tried on a simulator or emulator without a camera.
  async function pickFromLibrary(side) {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, exif: false });
    if (!result.canceled) await usePhoto(side, result.assets[0]);
  }

  function continueFromDetails() {
    const error = depositError(accountId, amount);
    if (error) setNotice(error); else { setNotice(''); setStep('front'); }
  }

  async function submit() {
    const deposit = await submitDeposit({ accountId, amount, front: photos.front, back: photos.back });
    if (deposit) {
      setSubmitted(deposit); setStep('done');
      await Promise.all([discardCheckPhoto(photos.front), discardCheckPhoto(photos.back)]);
      setPhotos({ front: null, back: null });
    }
  }

  if (step === 'done') return <Card style={[styles.nativeCard, styles.nativeDone]}>
    <View style={styles.nativeDoneIcon}><Icon name="checkmark" size={30} color={colors.green} /></View>
    <Text style={styles.nativeSectionTitle}>Deposit submitted</Text>
    <Text style={[styles.bodyText, { textAlign: 'center' }]}>{money(Number(amount))} to {titleCase(account?.account_type)}. Your check is pending review. Your balance will not change unless it is approved and clears.</Text>
    <Text selectable style={styles.nativeHint}>Reference: {submitted?.id}</Text>
    <Action onPress={() => { setSelectedAccount(accountId); navigate('/activity'); }} style={styles.nativeFullAction}>View activity</Action>
    <Action variant="secondary" onPress={reset} style={styles.nativeFullAction}>Deposit another check</Action>
  </Card>;

  const index = STEPS.indexOf(step);
  const side = SIDES[step];

  return <>
    <SectionHeading title="Deposit a check" subtitle={`Step ${index + 1} of ${STEPS.length} · ${STEP_NAMES[step]}`} />
    <View style={styles.nativeSteps} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: index + 1 }}>
      {STEPS.map((name, position) => <View key={name} style={[styles.nativeStep, position <= index && styles.nativeStepActive]} />)}
    </View>

    {step === 'details' && <Card style={styles.nativeCard}>
      <Select label="Deposit to" value={accountId} options={options} onChange={setAccountId} />
      <Field label="Check amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <Action onPress={continueFromDetails} icon="arrow-forward-outline" style={styles.nativeFullAction}>Continue</Action>
      <Text style={styles.nativeHint}>Have the check ready, signed on the back with “For mobile deposit only at CS160 Bank”.</Text>
    </Card>}

    {step === 'details' && checkDeposits.length > 0 && <Card style={styles.nativeCard}>
      <Text style={styles.cardTitle}>Recent check deposits</Text>
      {checkDeposits.slice(0, 5).map((item) => <View key={item.id} style={styles.nativeReviewRow}>
        <View><Text style={styles.rowTitle}>{money(Number(item.amount))}</Text><Text style={styles.rowSub}>{dateLabel(item.created_at)} · {titleCase(item.status)}</Text></View>
        <Icon name={item.status === 'pending' ? 'time-outline' : item.status === 'rejected' ? 'close-circle-outline' : 'checkmark-circle-outline'} color={item.status === 'pending' ? colors.amber : item.status === 'rejected' ? colors.red : colors.green} />
      </View>)}
    </Card>}

    {side && <Card style={styles.nativeCard}>
      <Text style={styles.cardTitle}>{side.title}</Text>
      {photos[step]
        ? <Image source={{ uri: photos[step].uri }} style={styles.nativeCheckPhoto} resizeMode="contain" accessibilityLabel={`Photo of the ${step} of the check`} />
        : <Pressable accessibilityRole="button" accessibilityLabel={`Take a photo of the ${step} of the check`} onPress={() => capture(step)} style={styles.nativeCheckPlaceholder}>
          <Icon name="camera-outline" size={32} color={colors.muted} />
          <Text style={styles.rowSub}>Tap to open the camera</Text>
        </Pressable>}
      {cameraBlocked && <View style={[styles.notice, styles.noticeError]}>
        <Icon name="alert-circle-outline" size={19} color={colors.red} />
        <Text style={styles.noticeText}>Camera access is off. Allow it in Settings to photograph your check.</Text>
      </View>}
      <Text style={[styles.bodyText, { marginBottom: 16 }]}>{side.tip}</Text>
      <View style={styles.nativeButtonStack}>
        {photos[step]
          ? <>
            <Action onPress={() => setStep(step === 'front' ? 'back' : 'review')} icon="arrow-forward-outline" style={styles.nativeFullAction}>Use this photo</Action>
            <Action variant="secondary" onPress={() => capture(step)} icon="camera-reverse-outline" style={styles.nativeFullAction}>Retake</Action>
          </>
          : <Action onPress={() => capture(step)} icon="camera-outline" style={styles.nativeFullAction}>Take photo</Action>}
        {cameraBlocked && <Action variant="secondary" onPress={() => Linking.openSettings()} icon="settings-outline" style={styles.nativeFullAction}>Open Settings</Action>}
        {!apiConfigured && <LinkButton onPress={() => pickFromLibrary(step)}>Demo: choose a photo instead</LinkButton>}
        <LinkButton onPress={() => setStep(step === 'front' ? 'details' : 'front')}>Back</LinkButton>
      </View>
    </Card>}

    {step === 'review' && <Card style={styles.nativeCard}>
      <View style={styles.nativeReviewRow}><Text style={styles.rowSub}>Deposit to</Text><Text style={styles.rowTitle}>{titleCase(account?.account_type)} {account?.account_number}</Text></View>
      <View style={styles.nativeReviewRow}><Text style={styles.rowSub}>Amount</Text><Text style={styles.rowTitle}>{money(Number(amount))}</Text></View>
      <View style={[styles.nativeRow2, { marginTop: 16, marginBottom: 16 }]}>
        {['front', 'back'].map((name) => <View key={name} style={styles.nativeCell}>
          <Image source={{ uri: photos[name]?.uri }} style={styles.nativeCheckThumb} resizeMode="contain" accessibilityLabel={`Photo of the ${name} of the check`} />
          <LinkButton onPress={() => capture(name)}>Retake {name}</LinkButton>
        </View>)}
      </View>
      <View style={styles.nativeButtonStack}>
        <Action onPress={submit} disabled={busy} icon="checkmark-outline" style={styles.nativeFullAction}>{busy ? 'Submitting…' : 'Submit deposit'}</Action>
        <LinkButton onPress={() => setStep('details')}>Edit account or amount</LinkButton>
      </View>
    </Card>}
  </>;
}
