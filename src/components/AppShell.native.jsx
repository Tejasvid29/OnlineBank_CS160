import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiConfigured } from '../services/api';
import { colors, dateLabel } from '../theme';
import { styles } from '../styles/appStyles';
import { Icon } from '../ui/primitives';
import { Toast } from '../ui/mobilePrimitives';
import { MOBILE_MORE, MOBILE_PAY_NAV, MOBILE_TABS } from '../navigation/nav';
import { useApp } from '../state/AppState';

// Native app shell: safe-area header, bottom tabs, a "More" sheet, a notifications modal and the notice toast.
// Rendered by app/_layout.native.jsx; web keeps AppShell.jsx (header + sidebar + <Slot />).
export function AppShell() {
  const insets = useSafeAreaInsets();
  const { profile, unread, setShowNotifications, navigate, notice, noticeKind, setNotice } = useApp();
  const [showMore, setShowMore] = useState(false);
  const [chromeHeight, setChromeHeight] = useState(0);

  return <View style={styles.appShell}>
    <View onLayout={(event) => setChromeHeight(event.nativeEvent.layout.height)}>
      <View style={[styles.nativeHeader, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigate('/')} style={styles.brand}>
          <View style={styles.brandMark}><Icon name="shield-checkmark" size={20} color={colors.white} /></View>
          <Text style={styles.brandName}>CS160 Bank</Text>
        </Pressable>
        <View style={styles.nativeHeaderRight}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} onPress={() => setShowNotifications(true)} style={styles.headerIcon} hitSlop={6}>
            <Icon name="notifications-outline" size={24} color={colors.ink} />
            {unread > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unread}</Text></View>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Profile and settings" onPress={() => navigate('/profile')} style={styles.avatar} hitSlop={6}>
            <Text style={styles.avatarText}>{(profile.first_name || 'U')[0]}</Text>
          </Pressable>
        </View>
      </View>

      {!apiConfigured && <View style={styles.nativeDemoBar}><Icon name="information-circle-outline" size={16} color="#6B5600" /><Text style={styles.demoText}>Demo mode — sample information; actions stay on this device.</Text></View>}
    </View>

    <Tabs
      initialRouteName="index"
      backBehavior="history"
      screenOptions={{ headerShown: false }}
      screenLayout={({ route, children }) => <ScreenFrame routeName={route.name} keyboardOffset={chromeHeight}>{children}</ScreenFrame>}
      tabBar={() => <TabBar onMore={() => setShowMore(true)} />}
    />

    <Toast text={notice} kind={noticeKind} top={chromeHeight + 8} onHide={() => setNotice('')} />
    <MoreSheet visible={showMore} onClose={() => setShowMore(false)} />
    <NotificationsModal />
  </View>;
}

// keyboardOffset is the header height above the screen, so KeyboardAvoidingView measures from the right place.
function ScreenFrame({ routeName, keyboardOffset, children }) {
  const pathname = usePathname();
  const { navigate } = useApp();
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
    {(routeName === 'transfer' || routeName === 'payments') && <View style={styles.nativeSegment}>
      {MOBILE_PAY_NAV.map(([path, label]) => <Pressable key={path} accessibilityRole="tab" accessibilityState={{ selected: pathname === path }} onPress={() => navigate(path)} style={[styles.nativeSegmentItem, pathname === path && styles.choiceActive]}>
        <Text style={[styles.choiceText, pathname === path && styles.choiceTextActive]}>{label}</Text>
      </Pressable>)}
    </View>}
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.nativeContent} keyboardShouldPersistTaps="handled">{children}</ScrollView>
  </KeyboardAvoidingView>;
}

function TabBar({ onMore }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { navigate } = useApp();
  const keyboardOpen = useAndroidKeyboardOpen();
  const inMore = !MOBILE_TABS.some(([, , , paths]) => paths.includes(pathname));

  // Android resizes the window for the keyboard, which would push the tab bar up above it.
  if (keyboardOpen) return null;
  return <View style={[styles.nativeTabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
    {MOBILE_TABS.map(([path, label, icon, paths]) => {
      const active = paths.includes(pathname);
      return <Pressable key={path} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label} onPress={() => navigate(path)} style={styles.nativeTab}>
        <Icon name={active ? icon.replace('-outline', '') : icon} size={23} color={active ? colors.blue : colors.muted} />
        <Text style={[styles.nativeTabLabel, active && styles.nativeTabLabelActive]} numberOfLines={1}>{label}</Text>
      </Pressable>;
    })}
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: inMore }} accessibilityLabel="More" onPress={onMore} style={styles.nativeTab}>
      <Icon name={inMore ? 'menu' : 'menu-outline'} size={23} color={inMore ? colors.blue : colors.muted} />
      <Text style={[styles.nativeTabLabel, inMore && styles.nativeTabLabelActive]}>More</Text>
    </Pressable>
  </View>;
}

function useAndroidKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return open;
}

function MoreSheet({ visible, onClose }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { navigate, isManager, openManager } = useApp();
  const go = (action) => { onClose(); action(); };
  const items = [...MOBILE_MORE.map(([path, label, icon]) => [path, label, icon, () => navigate(path)]), ...(isManager ? [['/manager', 'Manager dashboard', 'briefcase-outline', openManager]] : [])];

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.nativeSheetBackdrop} onPress={onClose} accessibilityLabel="Close menu">
      <Pressable style={[styles.nativeSheet, { paddingBottom: insets.bottom + 12 }]} onPress={() => {}}>
        <View style={styles.nativeSheetHandle} />
        <Text style={styles.sidebarLabel}>MORE</Text>
        {items.map(([path, label, icon, action]) => <Pressable key={path} accessibilityRole="button" onPress={() => go(action)} style={[styles.nativeSheetItem, pathname === path && styles.navItemActive]}>
          <Icon name={icon} size={22} color={pathname === path ? colors.blue : colors.muted} />
          <Text style={[styles.navText, pathname === path && styles.navTextActive]}>{label}</Text>
        </Pressable>)}
      </Pressable>
    </Pressable>
  </Modal>;
}

function NotificationsModal() {
  const { showNotifications, setShowNotifications, notifications, markRead } = useApp();
  const close = () => setShowNotifications(false);

  return <Modal visible={showNotifications} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <SafeAreaView style={styles.nativeModal} edges={['top', 'bottom']}>
      <View style={styles.notificationHeading}>
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Notifications</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={close} hitSlop={8}><Icon name="close-outline" size={26} color={colors.ink} /></Pressable>
      </View>
      <ScrollView>
        {notifications.length ? notifications.map((item) => <Pressable key={item.id} onPress={() => markRead(item)} style={[styles.notificationItem, !item.read && { backgroundColor: '#F1F7FD' }]}>
          <Text style={styles.rowTitle}>{item.notification_type}</Text>
          <Text style={styles.rowSub}>{item.message}</Text>
          <Text style={styles.notificationDate}>{dateLabel(item.created_at)}</Text>
        </Pressable>) : <Text style={[styles.emptyText, { paddingHorizontal: 16 }]}>No notifications yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
