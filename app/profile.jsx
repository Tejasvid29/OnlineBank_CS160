import React from 'react';
import { Text, View } from 'react-native';
import { apiConfigured } from '../src/services/api';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Divider, Field, Icon, LinkButton, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

export default function Profile() {
  const { notice, profileDraft, setProfileDraft, profile, setProfile, saveProfile, busy, isManager, setNotice, compact } = useApp();
  const set = (key) => (value) => setProfileDraft((current) => ({ ...current, [key]: value }));

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
        <Divider />
        <Text style={styles.cardTitle}>Mailing address</Text>
        <Field label="Street address" value={profileDraft.address_line1} onChangeText={set('address_line1')} placeholder="123 Main St" autoCapitalize="words" />
        <Field label="Apartment, suite or unit (optional)" value={profileDraft.address_line2} onChangeText={set('address_line2')} placeholder="Apt 4" autoCapitalize="words" />
        <View style={[styles.filterGrid, compact && styles.stack]}>
          <View style={styles.filterCell}><Field label="City" value={profileDraft.city} onChangeText={set('city')} autoCapitalize="words" /></View>
          <View style={[styles.filterCell, !compact && { maxWidth: 110, minWidth: 90 }]}><Field label="State" value={profileDraft.state} onChangeText={set('state')} placeholder="CA" autoCapitalize="characters" /></View>
          <View style={[styles.filterCell, !compact && { maxWidth: 140, minWidth: 110 }]}><Field label="ZIP code" value={profileDraft.zip_code} onChangeText={set('zip_code')} placeholder="94105" keyboardType="number-pad" /></View>
        </View>
        <Action onPress={saveProfile} disabled={busy}>Save changes</Action>
        {!apiConfigured && <LinkButton onPress={() => { setProfile((current) => ({ ...current, role: current.role === 'admin' ? 'customer' : 'admin' })); setNotice('Demo role changed.'); }}>Preview {isManager ? 'customer' : 'manager'} view</LinkButton>}
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
