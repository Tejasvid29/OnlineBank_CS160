import React from 'react';
import { Text, View } from 'react-native';
import { apiConfigured } from '../src/services/api';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Divider, Field, Icon, LinkButton, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

export default function Profile() {
  const { notice, profileDraft, setProfileDraft, profile, setProfile, saveProfile, busy, isManager, setNotice, compact } = useApp();

  return <>
    <SectionHeading title="Profile & settings" subtitle="Keep your contact information up to date." />
    <Notice text={notice} kind={notice.includes('updated') ? 'success' : 'error'} />
    <View style={[styles.twoColumns, compact && styles.stack]}>
      <Card style={styles.formCard}>
        <Text style={styles.cardTitle}>Personal details</Text>
        <Field label="First name" value={profileDraft.first_name} onChangeText={(value) => setProfileDraft((current) => ({ ...current, first_name: value }))} />
        <Field label="Last name" value={profileDraft.last_name} onChangeText={(value) => setProfileDraft((current) => ({ ...current, last_name: value }))} />
        <Field label="Phone number" value={profileDraft.phone} onChangeText={(value) => setProfileDraft((current) => ({ ...current, phone: value }))} keyboardType="phone-pad" />
        <View style={styles.field}><Text style={styles.fieldLabel}>Email address</Text><Text style={styles.readOnly}>{profile.email}</Text></View>
        <Action onPress={saveProfile} disabled={busy || apiConfigured}>Save changes</Action>
        {apiConfigured && <Text style={styles.rowSub}>Profile editing will be enabled when the backend adds a profile update endpoint.</Text>}
        {!apiConfigured && <LinkButton onPress={() => { setProfile((current) => ({ ...current, role: current.role === 'manager' ? 'customer' : 'manager' })); setNotice('Demo role changed.'); }}>Preview {isManager ? 'customer' : 'manager'} view</LinkButton>}
      </Card>
      <Card style={styles.asideCard}>
        <Icon name="shield-checkmark-outline" size={27} />
        <Text style={styles.cardTitle}>Account security</Text>
        <Text style={styles.bodyText}>Protect your account with a strong password and multi factor authentication. Contact your banking team if you notice unfamiliar activity.</Text>
        <Divider />
        <Text style={styles.rowSub}>Signed in as</Text>
        <Text style={styles.rowTitle}>{profile.email}</Text>
      </Card>
    </View>
  </>;
}
