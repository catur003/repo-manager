import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';

export function Button({ title, onPress, loading, variant = 'primary', disabled }) {
  return (
    <TouchableOpacity
      style={[styles.btn, styles[variant], disabled && styles.disabled]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.75}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const SKY = '#0ea5e9';

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
  },
  primary: { backgroundColor: SKY },
  secondary: { backgroundColor: '#e0f2fe' },
  danger: { backgroundColor: '#dc2626' },
  disabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  errorBox: { backgroundColor: '#fee2e2', padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { color: '#991b1b', fontSize: 13 },
});

export const COLORS = {
  sky: SKY,
  skyLight: '#e0f2fe',
  bg: '#f0f9ff',
  text: '#0f172a',
  textMuted: '#64748b',
};
