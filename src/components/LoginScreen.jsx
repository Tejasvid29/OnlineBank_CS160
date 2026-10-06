import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { apiConfigured } from '../services/api';
import { colors } from '../theme';
import { styles } from '../styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, Notice } from '../ui/primitives';
import { useApp } from '../state/AppState';

export function LoginScreen() {
  const {
    compact, authView, setAuthView, email, setEmail, password, setPassword, mfaCode, setMfaCode,
    busy, notice, setNotice, signIn, verifyMfa, resetPassword, register, registerDraft, setRegisterDraft,
  } = useApp();
  const setDraft = (key) => (value) => setRegisterDraft((current) => ({ ...current, [key]: value }));
  const switchView = (view) => { setAuthView(view); setNotice(''); };

  return <ScrollView style={styles.loginShell} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
    <View style={styles.loginTop}><View style={styles.brandMark}><Icon name="shield-checkmark" size={23} color={colors.white} /></View><Text style={styles.brandName}>CS160 Bank</Text></View>
    <View style={styles.loginBody}>
      <View style={[styles.loginIntro, compact && { paddingRight: 0 }]}>
        <Text style={styles.loginEyebrow}>BANKING MADE CLEAR</Text>
        <Text style={styles.loginHeadline}>A better view of your everyday banking.</Text>
        <Text style={styles.loginDescription}>Balances, transfers, payments and activity, all in one simple place.</Text>
        <View style={styles.loginBenefits}>
          <Text style={styles.benefit}>✓  See every account at a glance</Text>
          <Text style={styles.benefit}>✓  Move money with confidence</Text>
          <Text style={styles.benefit}>✓  Stay on top of upcoming bills</Text>
        </View>
      </View>
      <Card style={styles.loginCard}>
        <Text style={styles.loginCardTitle}>{authView === 'mfa' ? 'Verify your sign in' : authView === 'forgot' ? 'Reset your password' : authView === 'register' ? 'Create your account' : 'Welcome back'}</Text>
        <Text style={styles.loginCardSubtitle}>{authView === 'mfa' ? 'Enter the verification code sent to you.' : authView === 'forgot' ? 'We’ll send a recovery link if this email is registered.' : authView === 'register' ? 'Open your online banking profile in a minute.' : 'Sign in to your account'}</Text>
        <Notice text={notice} kind={notice.includes('sent') ? 'success' : 'error'} />
        {!apiConfigured && authView === 'login' ? <>
          <Notice text="UI demo: sample data only. No real banking transactions are performed." />
          <Action onPress={signIn} icon="arrow-forward-outline">Open demo dashboard</Action>
        </> : <>
          {authView === 'register' && <>
            <Field label="First name" value={registerDraft.first_name} onChangeText={setDraft('first_name')} placeholder="First name" autoCapitalize="words" />
            <Field label="Last name" value={registerDraft.last_name} onChangeText={setDraft('last_name')} placeholder="Last name" autoCapitalize="words" />
          </>}
          {authView === 'mfa' ? <Field label="Verification code" value={mfaCode} onChangeText={setMfaCode} keyboardType="number-pad" placeholder="Enter code" /> : <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />}
          {authView === 'register' && <Field label="Phone number (optional)" value={registerDraft.phone} onChangeText={setDraft('phone')} keyboardType="phone-pad" placeholder="555-123-4567" />}
          {(authView === 'login' || authView === 'register') && <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder={authView === 'register' ? 'At least 8 characters' : 'Enter password'} />}
          {authView === 'register' && <Field label="Confirm password" value={registerDraft.confirm} onChangeText={setDraft('confirm')} secureTextEntry placeholder="Re-enter password" />}
          <Action onPress={authView === 'mfa' ? verifyMfa : authView === 'forgot' ? resetPassword : authView === 'register' ? register : signIn} disabled={busy}>{busy ? 'Please wait…' : authView === 'mfa' ? 'Verify code' : authView === 'forgot' ? 'Send reset link' : authView === 'register' ? 'Create account' : 'Sign in'}</Action>
          {authView === 'login' && <LinkButton onPress={() => switchView('forgot')}>Forgot password?</LinkButton>}
          {authView === 'login' ? <LinkButton onPress={() => switchView('register')}>New here? Create an account</LinkButton> : <LinkButton onPress={() => switchView('login')}>Back to sign in</LinkButton>}
        </>}
      </Card>
    </View>
    <Text style={styles.loginFooter}>CS160 Bank · Class project interface</Text>
  </ScrollView>;
}
