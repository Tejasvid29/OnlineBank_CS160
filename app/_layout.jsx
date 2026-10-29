import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../src/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../src/state/AppState';
import { LoginScreen } from '../src/components/LoginScreen';
import { ResetPasswordScreen, readRecoveryLink } from '../src/components/ResetPasswordScreen';
import { AppShell } from '../src/components/AppShell';

// Read at load, before the router can rewrite the URL: the reset email lands on /reset-password#access_token=...
let pendingRecovery = readRecoveryLink();

function RootContent() {
  const { signedIn, restoring } = useApp();
  const [recovery, setRecovery] = React.useState(pendingRecovery);
  if (recovery) return <ResetPasswordScreen link={recovery} onDone={() => { pendingRecovery = null; setRecovery(null); }} />;
  if (restoring) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.blue} /></View>;
  return signedIn ? <AppShell><Slot /></AppShell> : <LoginScreen />;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppProvider>
        <RootContent />
      </AppProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>;
}
