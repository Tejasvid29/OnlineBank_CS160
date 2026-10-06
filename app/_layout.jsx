import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../src/theme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../src/state/AppState';
import { LoginScreen } from '../src/components/LoginScreen';
import { AppShell } from '../src/components/AppShell';

function RootContent() {
  const { signedIn, restoring } = useApp();
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
