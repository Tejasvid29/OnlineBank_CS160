import React from 'react';
import { Platform, Switch, View } from 'react-native';
import { apiConfigured } from '../src/services/api';
import { styles } from '../src/styles/appStyles';
import { colors } from '../src/theme';
import { Action, Card, Field, LinkButton, Text } from '../src/ui/primitives';
import { LARGER_TEXT_FACTOR, TEXT_CAP, useTextScale } from '../src/ui/textScale';
import { Collapsible } from '../src/ui/mobilePrimitives';
import { useApp } from '../src/state/AppState';

const PHONE_SETTING = Platform.OS === 'ios' ? 'Settings › Accessibility › Display & Text Size › Larger Text' : 'the Font size setting in Settings › Display or Settings › Accessibility';
const percent = (value) => `${Math.round(value * 100)}%`;

// The app's Larger text setting and how it combines with the phone's own text size (src/ui/textScale.js).
function LargerTextSetting() {
  const { largerText, setLargerText } = useApp();
  const { fontScale, scale, factor } = useTextScale();
  const addsNothing = largerText && factor === 1;
  return <Card style={styles.nativeCard}>
    <View style={styles.nativeSettingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>Larger text</Text>
        <Text style={styles.rowSub}>Makes text in this app {percent(LARGER_TEXT_FACTOR - 1)} bigger, on top of your phone's text size.</Text>
      </View>
      <Switch value={largerText} onValueChange={setLargerText} accessibilityLabel="Larger text" trackColor={{ true: colors.blue }} />
    </View>
    <Text style={styles.nativeHint}>
      Phone text size {percent(fontScale)} · In this app {percent(scale)}.
      {addsNothing ? ' Your phone already uses a very large size, so this setting adds nothing more.' : ''}
      {` To change the size everywhere, use ${PHONE_SETTING}.`}
    </Text>
  </Card>;
}

// Native profile: full-width details form, display settings, security notes folded away, and Sign out (the native header has none).
export default function Profile() {
  const { profileDraft, setProfileDraft, profile, setProfile, saveProfile, busy, isManager, setNotice, signOut } = useApp();
  const { large } = useTextScale();
  const setDraft = (key) => (value) => setProfileDraft((current) => ({ ...current, [key]: value }));

  return <>
    <Card style={styles.nativeProfileHeader}>
      <View style={styles.nativeAvatarLarge}><Text style={styles.nativeAvatarLargeText} maxFontSizeMultiplier={TEXT_CAP.chrome}>{(profile.first_name || 'U')[0]}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.nativeSectionTitle} numberOfLines={large ? undefined : 1} maxFontSizeMultiplier={TEXT_CAP.heading}>{profile.first_name} {profile.last_name}</Text>
        <Text style={styles.rowSub} numberOfLines={large ? undefined : 1}>{profile.email}</Text>
      </View>
    </Card>

    <Card style={styles.nativeCard}>
      <Text style={styles.cardTitle} maxFontSizeMultiplier={TEXT_CAP.heading}>Personal details</Text>
      <Field label="First name" value={profileDraft.first_name} onChangeText={setDraft('first_name')} autoCapitalize="words" />
      <Field label="Last name" value={profileDraft.last_name} onChangeText={setDraft('last_name')} autoCapitalize="words" />
      <Field label="Phone number" value={profileDraft.phone} onChangeText={setDraft('phone')} keyboardType="phone-pad" />
      <View style={styles.field}><Text style={styles.fieldLabel}>Email address</Text><Text style={styles.readOnly}>{profile.email}</Text></View>
      <Action onPress={saveProfile} disabled={busy} style={styles.nativeFullAction}>Save changes</Action>
    </Card>

    <LargerTextSetting />

    <Collapsible title="Account security" subtitle="Passwords and unfamiliar activity">
      <Text style={styles.bodyText}>Protect your account with a strong password and multi factor authentication. Contact your banking team if you notice unfamiliar activity.</Text>
    </Collapsible>

    {!apiConfigured && <View style={{ alignItems: 'center', marginBottom: 12 }}>
      <LinkButton onPress={() => { setProfile((current) => ({ ...current, role: current.role === 'admin' ? 'customer' : 'admin' })); setNotice('Demo role changed.', 'info'); }}>Preview {isManager ? 'customer' : 'manager'} view</LinkButton>
    </View>}
    <Action variant="secondary" icon="log-out-outline" onPress={signOut} style={styles.nativeFullAction}>Sign out</Action>
  </>;
}
