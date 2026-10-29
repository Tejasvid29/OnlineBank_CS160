import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { bankingApi } from '../services/api';
import { colors } from '../theme';
import { styles } from '../styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, Notice } from '../ui/primitives';

// Supabase appends the recovery token (or an error) to the URL hash when it redirects here.
export function readRecoveryLink() {
  if (typeof window === 'undefined' || !window.location?.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get('type') === 'recovery' && params.get('access_token')) return { token: params.get('access_token') };
  if (params.get('error_code') || params.get('error')) return { error: 'This reset link is invalid or has expired. Request a new one.' };
  return null;
}

export function ResetPasswordScreen({ link, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(link.error || '');
  const [finished, setFinished] = useState(false);

  // Keep the token out of the address bar and browser history.
  useEffect(() => { window.history.replaceState(null, '', '/'); }, []);

  async function submit() {
    if (password.length < 8) { setNotice('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setNotice('Passwords do not match.'); return; }
    setBusy(true); setNotice('');
    try { await bankingApi.resetPassword(link.token, password); setFinished(true); }
    catch (error) { setNotice(error.message || 'Could not reset your password.'); }
    finally { setBusy(false); }
  }

  return <ScrollView style={styles.loginShell} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
    <View style={styles.loginTop}><View style={styles.brandMark}><Icon name="shield-checkmark" size={23} color={colors.white} /></View><Text style={styles.brandName}>CS160 Bank</Text></View>
    <View style={styles.loginBody}>
      <Card style={styles.loginCard}>
        <Text style={styles.loginCardTitle}>{finished ? 'Password updated' : 'Choose a new password'}</Text>
        <Text style={styles.loginCardSubtitle}>{finished ? 'You can now sign in with your new password.' : 'Enter a new password for your account.'}</Text>
        <Notice text={notice} kind="error" />
        {finished || !link.token ? null : <>
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" />
          <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Re-enter password" />
          <Action onPress={submit} disabled={busy}>{busy ? 'Please wait…' : 'Update password'}</Action>
        </>}
        <LinkButton onPress={onDone}>Back to sign in</LinkButton>
      </Card>
    </View>
  </ScrollView>;
}
