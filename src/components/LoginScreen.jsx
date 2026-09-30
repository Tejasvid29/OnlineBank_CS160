import React from 'react';
import { Text, View } from 'react-native';
import { apiConfigured } from '../services/api';
import { colors } from '../theme';
import { styles } from '../styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, Notice } from '../ui/primitives';
import { useApp } from '../state/AppState';

export function LoginScreen() {
  const {
    compact, authView, setAuthView, email, setEmail, password, setPassword, mfaCode, setMfaCode,
    busy, notice, setNotice, signIn, verifyMfa, resetPassword,
  } = useApp();

  return <View style={styles.loginShell}>
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
        <Text style={styles.loginCardTitle}>{authView === 'mfa' ? 'Verify your sign in' : authView === 'forgot' ? 'Reset your password' : 'Welcome back'}</Text>
        <Text style={styles.loginCardSubtitle}>{authView === 'mfa' ? 'Enter the verification code sent to you.' : authView === 'forgot' ? 'We’ll send a recovery link if this email is registered.' : 'Sign in to your account'}</Text>
        <Notice text={notice} kind={notice.includes('sent') ? 'success' : 'error'} />
        {!apiConfigured && authView === 'login' ? <>
          <Notice text="UI demo: sample data only. No real banking transactions are performed." />
          <Action onPress={signIn} icon="arrow-forward-outline">Open demo dashboard</Action>
        </> : <>
          {authView === 'mfa' ? <Field label="Verification code" value={mfaCode} onChangeText={setMfaCode} keyboardType="number-pad" placeholder="Enter code" /> : <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />}
          {authView === 'login' && <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Enter password" />}
          <Action onPress={authView === 'mfa' ? verifyMfa : authView === 'forgot' ? resetPassword : signIn} disabled={busy}>{busy ? 'Please wait…' : authView === 'mfa' ? 'Verify code' : authView === 'forgot' ? 'Send reset link' : 'Sign in'}</Action>
          {authView === 'login' ? <LinkButton onPress={() => { setAuthView('forgot'); setNotice(''); }}>Forgot password?</LinkButton> : <LinkButton onPress={() => { setAuthView('login'); setNotice(''); }}>Back to sign in</LinkButton>}
        </>}
      </Card>
    </View>
    <Text style={styles.loginFooter}>CS160 Bank · Class project interface</Text>
  </View>;
}
