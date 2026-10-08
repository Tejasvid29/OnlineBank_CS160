import React from 'react';
import { Text, View } from 'react-native';
import { apiConfigured } from '../src/services/api';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Field, LinkButton } from '../src/ui/primitives';
import { Collapsible } from '../src/ui/mobilePrimitives';
import { useApp } from '../src/state/AppState';

// Native profile: full-width details form, security notes folded away, and Sign out (the native header has none).
export default function Profile() {
  const { profileDraft, setProfileDraft, profile, setProfile, saveProfile, busy, isManager, setNotice, signOut } = useApp();
  const setDraft = (key) => (value) => setProfileDraft((current) => ({ ...current, [key]: value }));

  return <>
    <Card style={styles.nativeProfileHeader}>
      <View style={styles.nativeAvatarLarge}><Text style={styles.nativeAvatarLargeText}>{(profile.first_name || 'U')[0]}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.nativeSectionTitle} numberOfLines={1}>{profile.first_name} {profile.last_name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{profile.email}</Text>
      </View>
    </Card>

    <Card style={styles.nativeCard}>
      <Text style={styles.cardTitle}>Personal details</Text>
      <Field label="First name" value={profileDraft.first_name} onChangeText={setDraft('first_name')} autoCapitalize="words" />
      <Field label="Last name" value={profileDraft.last_name} onChangeText={setDraft('last_name')} autoCapitalize="words" />
      <Field label="Phone number" value={profileDraft.phone} onChangeText={setDraft('phone')} keyboardType="phone-pad" />
      <View style={styles.field}><Text style={styles.fieldLabel}>Email address</Text><Text style={styles.readOnly}>{profile.email}</Text></View>
      <Action onPress={saveProfile} disabled={busy || apiConfigured} style={styles.nativeFullAction}>Save changes</Action>
      {apiConfigured && <Text style={styles.nativeHint}>Profile editing will be enabled when the backend adds a profile update endpoint.</Text>}
    </Card>

    <Collapsible title="Account security" subtitle="Passwords and unfamiliar activity">
      <Text style={styles.bodyText}>Protect your account with a strong password and multi factor authentication. Contact your banking team if you notice unfamiliar activity.</Text>
    </Collapsible>

    {!apiConfigured && <View style={{ alignItems: 'center', marginBottom: 12 }}>
      <LinkButton onPress={() => { setProfile((current) => ({ ...current, role: current.role === 'manager' ? 'customer' : 'manager' })); setNotice('Demo role changed.', 'info'); }}>Preview {isManager ? 'customer' : 'manager'} view</LinkButton>
    </View>}
    <Action variant="secondary" icon="log-out-outline" onPress={signOut} style={styles.nativeFullAction}>Sign out</Action>
  </>;
}
