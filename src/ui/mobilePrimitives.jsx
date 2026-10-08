import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, LayoutAnimation, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, dateLabel } from '../theme';
import { styles } from '../styles/appStyles';
import { Card, Icon } from './primitives';

// Controls for the app/*.native.jsx screens; only native screens render them. This is not a .native file because
// Expo Router's web build also bundles app/*.native.jsx (it routes to the non-native file, but the imports must still
// resolve on web). The date picker package ships no-op web stubs, so importing it here is safe.

// Dates travel through the app as local YYYY-MM-DD strings, the format validDate() and the API expect.
export const toYmd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const fromYmd = (value) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); };

function FieldLabel({ label, labelRight }) {
  if (!labelRight) return <Text style={styles.fieldLabel}>{label}</Text>;
  return <View style={styles.nativeLabelRow}><Text style={[styles.fieldLabel, { marginBottom: 0 }]}>{label}</Text>{labelRight}</View>;
}

function BottomSheet({ visible, onClose, title, children }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.nativeSheetBackdrop} onPress={onClose} accessibilityLabel="Close">
      <Pressable style={[styles.nativeSheet, { paddingBottom: insets.bottom + 12, maxHeight: '75%' }]} onPress={() => {}}>
        <View style={styles.nativeSheetHandle} />
        {title && <Text style={styles.sidebarLabel}>{title.toUpperCase()}</Text>}
        {children}
      </Pressable>
    </Pressable>
  </Modal>;
}

// Dropdown for longer choice lists. Options are { value, label, detail? }, the same shape Choice takes.
export function Select({ label, labelRight, value, options, onChange, placeholder = 'Choose…' }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return <View style={styles.field}>
    <FieldLabel label={label} labelRight={labelRight} />
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label || placeholder}`} accessibilityHint="Opens a list of choices" onPress={() => setOpen(true)} style={styles.nativeSelect}>
      <Text style={current ? styles.nativeSelectText : styles.nativePlaceholder} numberOfLines={1}>{current?.label || placeholder}</Text>
      <Icon name="chevron-down" size={18} color={colors.muted} />
    </Pressable>
    <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
      <ScrollView>
        {options.map((option) => {
          const selected = option.value === value;
          return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { onChange(option.value); setOpen(false); }} style={[styles.nativeSheetItem, selected && styles.navItemActive]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.navText, selected && styles.navTextActive]}>{option.label}</Text>
              {option.detail && <Text style={styles.rowSub}>{option.detail}</Text>}
            </View>
            {selected && <Icon name="checkmark" size={20} />}
          </Pressable>;
        })}
      </ScrollView>
    </BottomSheet>
  </View>;
}

// Native date picker that reads and writes YYYY-MM-DD. Android opens the system dialog; iOS shows an inline calendar in a sheet.
export function DateField({ label, value, onChange, minimumDate, maximumDate, placeholder = 'Choose a date', clearable = false }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());

  function show() {
    let start = value ? fromYmd(value) : new Date();
    if (minimumDate && start < minimumDate) start = minimumDate;
    if (maximumDate && start > maximumDate) start = maximumDate;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: start, mode: 'date', minimumDate, maximumDate, onValueChange: (_event, date) => onChange(toYmd(date)) });
      return;
    }
    setDraft(start); setOpen(true);
  }

  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.nativeSelect}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? dateLabel(value) : 'not set'}`} accessibilityHint="Opens a date picker" onPress={show} style={styles.nativeDateButton}>
        <Icon name="calendar-outline" size={18} color={colors.muted} />
        <Text style={value ? styles.nativeSelectText : styles.nativePlaceholder} numberOfLines={1}>{value ? dateLabel(value) : placeholder}</Text>
      </Pressable>
      {clearable && value ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={() => onChange('')} hitSlop={8}><Icon name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
    </View>
    {Platform.OS === 'ios' && <BottomSheet visible={open} onClose={() => setOpen(false)}>
      <View style={styles.nativeSheetHeader}>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} hitSlop={8}><Text style={styles.linkText}>Cancel</Text></Pressable>
        <Text style={styles.rowTitle}>{label}</Text>
        <Pressable accessibilityRole="button" onPress={() => { onChange(toYmd(draft)); setOpen(false); }} hitSlop={8}><Text style={styles.linkText}>Done</Text></Pressable>
      </View>
      <DateTimePicker value={draft} mode="date" display="inline" minimumDate={minimumDate} maximumDate={maximumDate} accentColor={colors.blue} themeVariant="light" onValueChange={(_event, date) => setDraft(date)} />
    </BottomSheet>}
  </View>;
}

// Card whose body folds away, for secondary detail. Pass open/onToggle to control it from state.
export function Collapsible({ title, subtitle, defaultOpen = false, open: controlledOpen, onToggle, children }) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (onToggle) onToggle(!open); else setLocalOpen(!open);
  }
  return <Card style={styles.nativeSection}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={toggle} style={styles.nativeSectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.nativeSectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
    </Pressable>
    {open && <View style={styles.nativeSectionBody}>{children}</View>}
  </Card>;
}

// Transient message shown over the current screen. Replaces the inline <Notice> on native screens.
export function Toast({ text, kind = 'error', top = 0, onHide }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!text) return undefined;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility(text);
    const timer = setTimeout(onHide, kind === 'error' ? 5000 : 3500);
    return () => clearTimeout(timer);
  }, [text, kind]);
  if (!text) return null;
  const icon = kind === 'error' ? 'alert-circle-outline' : kind === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline';
  const tint = kind === 'error' ? colors.red : kind === 'success' ? colors.green : colors.blue;
  return <Animated.View style={[styles.nativeToastWrap, { top, opacity }]}>
    <Pressable accessibilityRole="alert" accessibilityHint="Tap to dismiss" onPress={onHide} style={[styles.notice, kind === 'error' && styles.noticeError, kind === 'success' && styles.noticeSuccess, styles.nativeToast]}>
      <Icon name={icon} size={19} color={tint} />
      <Text style={styles.noticeText}>{text}</Text>
    </Pressable>
  </Animated.View>;
}
