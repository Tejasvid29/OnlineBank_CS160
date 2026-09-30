import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { styles } from '../styles/appStyles';

export function Icon({ name, size = 20, color = colors.blue }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function Action({ children, onPress, variant = 'primary', icon, disabled = false, style }) {
  const primary = variant === 'primary';
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, primary ? styles.actionPrimary : styles.actionSecondary, disabled && styles.disabled, pressed && styles.pressed, style]}>
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
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityHint={accessibilityHint} style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8294A2" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize || 'none'} />
  </View>;
}

export function Choice({ label, value, options, onChange }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choiceRow}>{options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: value === option.value }} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceActive]}><Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text></Pressable>)}</View></View>;
}

export function SectionHeading({ title, subtitle, action, onAction }) {
  return <View style={styles.sectionHeading}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{action && <LinkButton onPress={onAction} icon="arrow-forward">{action}</LinkButton>}</View>;
}

export function Status({ children, color = colors.green }) { return <View style={[styles.status, { backgroundColor: color + '14' }]}><View style={[styles.statusDot, { backgroundColor: color }]} /><Text style={[styles.statusText, { color }]}>{children}</Text></View>; }

export function Notice({ text, kind = 'info' }) { return text ? <View style={[styles.notice, kind === 'error' && styles.noticeError, kind === 'success' && styles.noticeSuccess]}><Icon name={kind === 'error' ? 'alert-circle-outline' : kind === 'success' ? 'checkmark-circle-outline' : 'information-circle-outline'} size={19} color={kind === 'error' ? colors.red : kind === 'success' ? colors.green : colors.blue} /><Text style={styles.noticeText}>{text}</Text></View> : null; }
