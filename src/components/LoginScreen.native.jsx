import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiConfigured } from '../services/api';
import { colors } from '../theme';
import { styles } from '../styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, Notice } from '../ui/primitives';
import { useApp } from '../state/AppState';

const TITLES = { login: 'Welcome back', register: 'Create your account', forgot: 'Reset your password', mfa: 'Verify your sign in' };
const SUBTITLES = { login: 'Sign in to your account', register: 'Open your online banking profile in a minute.', forgot: 'We’ll send a recovery link if this email is registered.', mfa: 'Enter the verification code sent to you.' };
const SUBMIT = { login: 'Sign in', register: 'Create account', forgot: 'Send reset link', mfa: 'Verify code' };

// Native sign in / register / reset / MFA: single column, safe-area top padding, full-width buttons,
// and keyboard avoidance. Same state and actions as the web LoginScreen.jsx.
export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const {
    authView, setAuthView, email, setEmail, password, setPassword, mfaCode, setMfaCode,
    busy, notice, noticeKind, setNotice, signIn, verifyMfa, resetPassword, register, registerDraft, setRegisterDraft,
  } = useApp();
  const setDraft = (key) => (value) => setRegisterDraft((current) => ({ ...current, [key]: value }));
  const switchView = (view) => { setAuthView(view); setNotice(''); };
  const submit = { login: signIn, register, forgot: resetPassword, mfa: verifyMfa }[authView];

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.loginShell} contentContainerStyle={[styles.nativeLoginContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.nativeLoginBrand}><View style={styles.brandMark}><Icon name="shield-checkmark" size={20} color={colors.white} /></View><Text style={styles.brandName}>CS160 Bank</Text></View>
      {authView === 'login' && <>
        <Text style={styles.loginEyebrow}>BANKING MADE CLEAR</Text>
        <Text style={styles.nativeLoginHeadline}>A better view of your everyday banking.</Text>
        <Text style={styles.nativeLoginDescription}>Balances, transfers, payments and activity, all in one simple place.</Text>
      </>}
      <Card style={styles.nativeLoginCard}>
        <Text style={styles.loginCardTitle}>{TITLES[authView]}</Text>
        <Text style={styles.loginCardSubtitle}>{SUBTITLES[authView]}</Text>
        <Notice text={notice} kind={noticeKind} />
        {!apiConfigured && authView === 'login' ? <>
          <Notice text="UI demo: sample data only. No real banking transactions are performed." />
          <Action onPress={signIn} icon="arrow-forward-outline" style={styles.nativeFullAction}>Open demo dashboard</Action>
        </> : <>
          {authView === 'register' && <>
            <Field label="First name" value={registerDraft.first_name} onChangeText={setDraft('first_name')} placeholder="First name" autoCapitalize="words" />
            <Field label="Last name" value={registerDraft.last_name} onChangeText={setDraft('last_name')} placeholder="Last name" autoCapitalize="words" />
          </>}
          {authView === 'mfa' ? <Field label="Verification code" value={mfaCode} onChangeText={setMfaCode} keyboardType="number-pad" placeholder="Enter code" /> : <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />}
          {authView === 'register' && <Field label="Phone number (optional)" value={registerDraft.phone} onChangeText={setDraft('phone')} keyboardType="phone-pad" placeholder="555-123-4567" />}
          {(authView === 'login' || authView === 'register') && <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder={authView === 'register' ? 'At least 8 characters' : 'Enter password'} />}
          {authView === 'register' && <Field label="Confirm password" value={registerDraft.confirm} onChangeText={setDraft('confirm')} secureTextEntry placeholder="Re-enter password" />}
          <Action onPress={submit} disabled={busy} style={styles.nativeFullAction}>{busy ? 'Please wait…' : SUBMIT[authView]}</Action>
          <View style={styles.nativeLoginLinks}>
            {authView === 'login' && <LinkButton onPress={() => switchView('forgot')}>Forgot password?</LinkButton>}
            {authView === 'login' ? <LinkButton onPress={() => switchView('register')}>New here? Create an account</LinkButton> : <LinkButton onPress={() => switchView('login')}>Back to sign in</LinkButton>}
          </View>
        </>}
      </Card>
      <Text style={styles.nativeLoginFooter}>CS160 Bank · Class project interface</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}
