import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiConfigured } from '../services/api';
import { colors, dateLabel } from '../theme';
import { styles } from '../styles/appStyles';
import { Icon, LinkButton, Text } from '../ui/primitives';
import { TEXT_CAP, useTextScale } from '../ui/textScale';
import { ScreenRefreshContext, SegmentedTabs, Toast } from '../ui/mobilePrimitives';
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
        <Pressable onPress={() => navigate('/')} style={[styles.brand, { flexShrink: 1 }]}>
          <View style={styles.brandMark}><Icon name="shield-checkmark" size={20} color={colors.white} /></View>
          <Text style={[styles.brandName, { flexShrink: 1 }]} maxFontSizeMultiplier={TEXT_CAP.display}>CS160 Bank</Text>
        </Pressable>
        <View style={styles.nativeHeaderRight}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} onPress={() => setShowNotifications(true)} style={styles.headerIcon} hitSlop={6}>
            <Icon name="notifications-outline" size={24} color={colors.ink} />
            {unread > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText} maxFontSizeMultiplier={TEXT_CAP.chrome}>{unread}</Text></View>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Profile and settings" onPress={() => navigate('/profile')} style={styles.avatar} hitSlop={6}>
            <Text style={styles.avatarText} maxFontSizeMultiplier={TEXT_CAP.chrome}>{(profile.first_name || 'U')[0]}</Text>
          </Pressable>
        </View>
      </View>

      {!apiConfigured && <View style={styles.nativeDemoBar}><Icon name="information-circle-outline" size={16} color="#6B5600" /><Text style={[styles.demoText, { flex: 1 }]}>Demo mode — sample information; actions stay on this device.</Text></View>}
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

// Screens that can turn on pull to refresh with usePullToRefresh (src/ui/mobilePrimitives.jsx). Their ScrollView always
// has a RefreshControl: ScrollView renders a different tree with and without one, so adding or removing it would remount
// the whole screen and reset its state. Only the control's props change when a handler is set or cleared.
const PULL_TO_REFRESH_ROUTES = ['manager'];

// keyboardOffset is the header height above the screen, so KeyboardAvoidingView measures from the right place.
function ScreenFrame({ routeName, keyboardOffset, children }) {
  const pathname = usePathname();
  const { navigate } = useApp();
  const handler = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Stable, so registering never re-renders the screen through the context.
  const register = useCallback((onRefresh) => { handler.current = onRefresh; setEnabled(Boolean(onRefresh)); }, []);
  async function refresh() {
    if (!handler.current) return; // iOS has no `enabled` prop; with no handler the pull just ends.
    setRefreshing(true);
    try { await handler.current(); } finally { setRefreshing(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
    {(routeName === 'transfer' || routeName === 'payments') && <SegmentedTabs options={MOBILE_PAY_NAV} value={pathname} onChange={navigate} />}
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.nativeContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={PULL_TO_REFRESH_ROUTES.includes(routeName)
        ? <RefreshControl refreshing={refreshing} onRefresh={refresh} enabled={enabled} tintColor={enabled ? colors.blue : 'transparent'} colors={[colors.blue]} />
        : undefined}
    >
      <ScreenRefreshContext.Provider value={register}>{children}</ScreenRefreshContext.Provider>
    </ScrollView>
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
      return <Pressable key={path} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label} accessibilityShowsLargeContentViewer accessibilityLargeContentTitle={label} onPress={() => navigate(path)} style={styles.nativeTab}>
        <Icon name={active ? icon.replace('-outline', '') : icon} size={23} color={active ? colors.blue : colors.muted} />
        <Text style={[styles.nativeTabLabel, active && styles.nativeTabLabelActive]} numberOfLines={1} maxFontSizeMultiplier={TEXT_CAP.chrome}>{label}</Text>
      </Pressable>;
    })}
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: inMore }} accessibilityLabel="More" accessibilityShowsLargeContentViewer accessibilityLargeContentTitle="More" onPress={onMore} style={styles.nativeTab}>
      <Icon name={inMore ? 'menu' : 'menu-outline'} size={23} color={inMore ? colors.blue : colors.muted} />
      <Text style={[styles.nativeTabLabel, inMore && styles.nativeTabLabelActive]} numberOfLines={1} maxFontSizeMultiplier={TEXT_CAP.chrome}>More</Text>
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
      <Pressable style={[styles.nativeSheet, { paddingBottom: insets.bottom + 12, maxHeight: '85%' }]} onPress={() => {}}>
        <View style={styles.nativeSheetHandle} />
        <Text style={styles.sidebarLabel}>MORE</Text>
        <ScrollView>
          {items.map(([path, label, icon, action]) => <Pressable key={path} accessibilityRole="button" onPress={() => go(action)} style={[styles.nativeSheetItem, pathname === path && styles.navItemActive]}>
            <Icon name={icon} size={22} color={pathname === path ? colors.blue : colors.muted} />
            <Text style={[styles.navText, pathname === path && styles.navTextActive, { flex: 1 }]}>{label}</Text>
          </Pressable>)}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}

function NotificationsModal() {
  const { showNotifications, setShowNotifications, notifications, markRead, markAllRead, unread } = useApp();
  const { large } = useTextScale();
  const close = () => setShowNotifications(false);
  const markAll = unread > 0 && <LinkButton onPress={markAllRead}>Mark all read</LinkButton>;

  return <Modal visible={showNotifications} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <SafeAreaView style={styles.nativeModal} edges={['top', 'bottom']}>
      <View style={styles.notificationHeading}>
        <Text style={[styles.cardTitle, { marginBottom: 0, flex: 1 }]} maxFontSizeMultiplier={TEXT_CAP.heading}>Notifications</Text>
        <View style={styles.notificationActions}>
          {!large && markAll}
          <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={close} hitSlop={8}><Icon name="close-outline" size={26} color={colors.ink} /></Pressable>
        </View>
      </View>
      {large && markAll && <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>{markAll}</View>}
      <ScrollView>
        {notifications.length ? notifications.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.notification_type}. ${item.message}. ${dateLabel(item.created_at)}`} onPress={() => markRead(item)} style={[styles.notificationItem, !item.read && { backgroundColor: '#F1F7FD' }]}>
          <Text style={styles.rowTitle}>{item.notification_type}</Text>
          <Text style={styles.rowSub}>{item.message}</Text>
          <Text style={styles.notificationDate}>{dateLabel(item.created_at)}</Text>
        </Pressable>) : <Text style={[styles.emptyText, { paddingHorizontal: 16 }]}>No notifications yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
