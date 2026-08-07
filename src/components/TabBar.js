/**
 * TabBar.js
 * Tab bar bawah custom, dibangun cuma dari View/Text/Pressable bawaan RN -
 * sengaja TIDAK pakai @react-navigation supaya Fase 1 tidak butuh install
 * dependency native baru + prebuild ulang (yang berisiko bikin mismatch
 * versi kalau dikerjakan tanpa akses build environment langsung). Kalau
 * app makin kompleks (butuh deep link, animasi transisi antar layar,
 * dsb), ini kandidat pertama yang diganti react-navigation.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../theme';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'github', label: 'GitHub Repos' },
  { key: 'local', label: 'Local Repos' },
];

export function TabBar({ active, onChange }) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)} hitSlop={8}>
            <View style={[styles.dot, isActive && styles.dotActive]} />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: COLORS.accent },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.inkFaint },
  labelActive: { color: COLORS.accent, fontWeight: '700' },
});
