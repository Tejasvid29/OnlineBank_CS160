import React, { createContext, useContext } from 'react';
import { Platform, Pressable, StyleSheet, Text as NativeText, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { styles } from '../styles/appStyles';
import { TEXT_CAP, TextScaleContext, useTextScale } from './textScale';

const InsideText = createContext(false);

// React Native's Text plus the app's Larger text setting (src/ui/textScale.js). Phone screens and the components they
// share use this one. With the setting off (always on web) it is plain Text. With it on, fontSize and lineHeight are
// multiplied by the setting's factor. Nested Text without its own fontSize still inherits from its parent.
// maxFontSizeMultiplier caps the combined size, the app setting and the phone's text size together.
export function Text({ style, maxFontSizeMultiplier, ...props }) {
  const factor = useContext(TextScaleContext);
  const nested = useContext(InsideText);
  if (factor === 1) return <NativeText style={style} maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
  const flat = StyleSheet.flatten(style) || {};
  const applied = maxFontSizeMultiplier ? Math.min(factor, maxFontSizeMultiplier) : factor;
  const scaled = {};
  if (flat.fontSize != null || !nested) scaled.fontSize = (flat.fontSize ?? 14) * applied;
  if (flat.lineHeight != null) scaled.lineHeight = flat.lineHeight * applied;
  return <InsideText.Provider value>
    <NativeText {...props} style={[style, scaled]} maxFontSizeMultiplier={maxFontSizeMultiplier ? Math.max(1, maxFontSizeMultiplier / applied) : undefined} />
  </InsideText.Provider>;
}

export function Icon({ name, size = 20, color = colors.blue }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Action({ children, onPress, variant = 'primary', icon, disabled = false, style, accessibilityLabel }) {
  const primary = variant === 'primary';
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, primary ? styles.actionPrimary : styles.actionSecondary, disabled && styles.disabled, pressed && styles.pressed, style]}>
    {icon && <Icon name={icon} size={17} color={primary ? colors.white : colors.blue} />}
    <Text style={[styles.actionText, { color: primary ? colors.white : colors.blue }]}>{children}</Text>
  </Pressable>;
}

export function LinkButton({ children, onPress, icon }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkButton}>
    <Text style={styles.linkText}>{children}</Text>{icon && <Icon name={icon} size={16} />}
  </Pressable>;
}

export function Card({ children, style }) { return <View style={[styles.card, style]}>{children}</View>; }
export function Divider() { return <View style={styles.divider} />; }

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, accessibilityHint }) {
  const { factor } = useTextScale();
  // Phones: the box grows with the text instead of clipping it at large text sizes.
  const inputStyle = [styles.input, Platform.OS !== 'web' && styles.nativeInput, factor !== 1 && { fontSize: StyleSheet.flatten(styles.input).fontSize * factor }];
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityHint={accessibilityHint} style={inputStyle} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8294A2" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize || 'none'} />
  </View>;
}

export function Choice({ label, value, options, onChange }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choiceRow}>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceActive]}><Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text></Pressable>)}</View></View>;
}

// At large text sizes the action link moves under the title instead of squeezing it.
export function SectionHeading({ title, subtitle, action, onAction }) {
  const { large } = useTextScale();
  return <View style={[styles.sectionHeading, large && styles.nativeStacked]}><View style={!large && { flex: 1 }}><Text style={styles.sectionTitle} maxFontSizeMultiplier={TEXT_CAP.heading}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{action && <LinkButton onPress={onAction} icon="arrow-forward">{action}</LinkButton>}</View>;
}

export function Status({ children, color = colors.green }) { return <View style={[styles.status, { backgroundColor: color + '14' }]}><View style={[styles.statusDot, { backgroundColor: color }]} /><Text style={[styles.statusText, { color }]}>{children}</Text></View>; }

export function Notice({ text, kind = 'info' }) { return text ? <View style={[styles.notice, kind === 'error' && styles.noticeError, kind === 'success' && styles.noticeSuccess]}><Icon name={kind === 'error' ? 'alert-circle-outline' : kind === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={19} color={kind === 'error' ? colors.red : kind === 'success' ? colors.green : colors.blue} /><Text style={styles.noticeText}>{text}</Text></View> : null; }
