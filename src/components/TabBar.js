/**
 * TabBar.js
 * Tab bar bawah custom, dibangun cuma dari View/Text/Pressable bawaan RN -
 * sengaja TIDAK pakai @react-navigation supaya Fase 1 tidak butuh install
 * dependency native baru + prebuild ulang (yang berisiko bikin mismatch
 * versi kalau dikerjakan tanpa akses build environment langsung). Kalau
 * app makin kompleks (butuh deep link, animasi transisi antar layar,
 * dsb), ini kandidat pertama yang diganti react-navigation.
 *
 * ICON (7 Agustus 2026): pakai @expo/vector-icons (Feather) - digabung
 * sekalian dengan rebuild dev client yang sudah wajib buat
 * expo-document-picker (Fase 6 Upload), jadi cuma satu kali rebuild buat
 * dua-duanya, bukan emoji (keputusan awal "jangan pernah pake icon" itu
 * soal emoji/pictogram kasual - vector icon ini permintaan terpisah).
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING } from '../theme';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'home' },
  { key: 'github', label: 'GitHub Repos', icon: 'github' },
  { key: 'local', label: 'Local Repos', icon: 'folder' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export function TabBar({ active, onChange, bottomInset = 0 }) {
  return (
    // paddingBottom gabung: base SPACING.lg + inset device (home
    // indicator/gesture bar), bukan angka statis - lihat App.js.
    <View style={[styles.bar, { paddingBottom: SPACING.lg + bottomInset }]}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)} hitSlop={8}>
            <Feather name={tab.icon} size={20} color={isActive ? COLORS.accent : COLORS.inkFaint} />
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
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.inkFaint },
  labelActive: { color: COLORS.accent, fontWeight: '700' },
});
