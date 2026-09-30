import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { apiConfigured } from '../services/api';
import { colors, dateLabel } from '../theme';
import { styles } from '../styles/appStyles';
import { Icon, LinkButton } from '../ui/primitives';
import { NAV } from '../navigation/nav';
import { useApp } from '../state/AppState';

export function AppShell({ children }) {
  const pathname = usePathname();
  const {
    compact, profile, unread, isManager, showNotifications, setShowNotifications, notifications, markRead,
    navigate, signOut, openManager,
  } = useApp();

  return <View style={styles.appShell}>
    <View style={[styles.header, compact && styles.headerMobile]}>
      <Pressable onPress={() => navigate('/')} style={styles.brand}>
        <View style={styles.brandMark}><Icon name="shield-checkmark" size={20} color={colors.white} /></View>
        <Text style={styles.brandName}>CS160 Bank</Text>
      </Pressable>
      <View style={styles.headerRight}>
        <Text style={[styles.headerGreeting, compact && { display: 'none' }]}>Hello, {profile.first_name}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} onPress={() => setShowNotifications((value) => !value)} style={styles.headerIcon}>
          <Icon name="notifications-outline" size={22} color={colors.ink} />
          {unread > 0 && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unread}</Text></View>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Profile and settings" onPress={() => navigate('/profile')} style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile.first_name || 'U')[0]}</Text>
        </Pressable>
        <LinkButton onPress={signOut}>Sign out</LinkButton>
      </View>
    </View>

    {!apiConfigured && <View style={styles.demoBar}><Icon name="information-circle-outline" size={16} color="#6B5600" /><Text style={styles.demoText}>Demo mode — sample information; actions are local to this browser session.</Text></View>}

    <View style={styles.appBody}>
      {!compact && <View style={styles.sidebar}>
        <Text style={styles.sidebarLabel}>BANKING</Text>
        {NAV.map(([path, label, icon]) => <Pressable key={path} accessibilityRole="button" accessibilityState={{ selected: pathname === path }} onPress={() => navigate(path)} style={[styles.navItem, pathname === path && styles.navItemActive]}>
          <Icon name={icon} size={20} color={pathname === path ? colors.blue : colors.muted} />
          <Text style={[styles.navText, pathname === path && styles.navTextActive]}>{label}</Text>
        </Pressable>)}
        {isManager && <>
          <Text style={[styles.sidebarLabel, { marginTop: 28 }]}>STAFF</Text>
          <Pressable onPress={openManager} style={[styles.navItem, pathname === '/manager' && styles.navItemActive]}>
            <Icon name="briefcase-outline" size={20} />
            <Text style={styles.navText}>Manager dashboard</Text>
          </Pressable>
        </>}
        <View style={styles.sidebarBottom}>
          <Icon name="help-circle-outline" size={20} color={colors.muted} />
          <Text style={styles.sidebarBottomText}>Need help? Contact support.</Text>
        </View>
      </View>}

      <View style={styles.mainColumn}>
        {compact && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileNav} contentContainerStyle={styles.mobileNavContent}>
          {NAV.map(([path, label]) => <Pressable key={path} accessibilityRole="button" onPress={() => navigate(path)} style={[styles.mobileNavItem, pathname === path && styles.mobileNavActive]}>
            <Text style={[styles.mobileNavText, pathname === path && { color: colors.blue }]}>{label}</Text>
          </Pressable>)}
          {isManager && <Pressable accessibilityRole="button" onPress={openManager} style={[styles.mobileNavItem, pathname === '/manager' && styles.mobileNavActive]}>
            <Text style={[styles.mobileNavText, pathname === '/manager' && { color: colors.blue }]}>Manager</Text>
          </Pressable>}
        </ScrollView>}
        <ScrollView contentContainerStyle={[styles.content, compact && styles.contentMobile]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>

      {showNotifications && <View style={[styles.notificationPanel, compact && styles.notificationPanelMobile]}>
        <View style={styles.notificationHeading}>
          <Text style={styles.cardTitle}>Notifications</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setShowNotifications(false)}><Icon name="close-outline" size={24} color={colors.ink} /></Pressable>
        </View>
        {notifications.length ? notifications.map((item) => <Pressable key={item.id} onPress={() => markRead(item)} style={[styles.notificationItem, !item.read && { backgroundColor: '#F1F7FD' }]}>
          <Text style={styles.rowTitle}>{item.notification_type}</Text>
          <Text style={styles.rowSub}>{item.message}</Text>
          <Text style={styles.notificationDate}>{dateLabel(item.created_at)}</Text>
        </Pressable>) : <Text style={styles.emptyText}>No notifications yet.</Text>}
      </View>}
    </View>
  </View>;
}
