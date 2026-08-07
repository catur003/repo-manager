/**
 * UI.js
 * Komponen dasar bersama, dipakai semua layar. Warna diambil dari
 * theme.js (COLORS/SPACING/RADIUS), bukan hex hardcode di sini.
 *
 * BUGFIX KONTRAS (7 Agustus 2026): sebelumnya variant="secondary" pakai
 * background terang (skyLight) TAPI warna teks di-hardcode putih
 * (styles.btnText: {color:'#fff'}) - hasilnya teks nyaris tak kebaca
 * (putih di atas biru sangat muda). Root cause: satu StyleSheet
 * `btnText` dipakai untuk SEMUA variant padahal cuma primary/danger yang
 * punya background gelap. Fix: warna teks sekarang ditentukan per-variant
 * (fg), bukan style statis - variant terang (secondary) otomatis dapat
 * teks gelap (COLORS.ink), variant gelap (primary/danger/warning) dapat
 * teks putih (COLORS.onAccent). Pola ini dicontek dari components/Button.tsx
 * milik zenvps yang sudah lolos kasus yang sama.
 */

import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../theme';

const VARIANT_BG = {
  primary: COLORS.accent,
  danger: COLORS.red,
  warning: COLORS.amber,
  secondary: COLORS.card,
};

// Cuma "secondary" yang punya background terang -> butuh teks gelap.
// Kalau nanti nambah variant baru, WAJIB didaftarkan salah satu sisi ini,
// jangan andalkan default, supaya kasus kontras kayak kemarin tidak
// terulang secara diam-diam.
const LIGHT_BG_VARIANTS = new Set(['secondary']);

export function Button({ title, onPress, loading, variant = 'primary', disabled, style }) {
  const isLight = LIGHT_BG_VARIANTS.has(variant);
  const fg = isLight ? COLORS.ink : COLORS.onAccent;
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        { backgroundColor: VARIANT_BG[variant] || VARIANT_BG.primary },
        isLight && styles.secondaryBorder,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.75}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{title}</Text>}
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

export function SectionTitle({ children, style }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

// Badge status repo (dipakai Local Repos: Clean/Modified, dan Compare:
// Sinkron/Lokal Lebih Baru/GitHub Lebih Baru/Diverged). Warna & label
// per-kunci, pola sama dengan StatusPill.tsx milik zenvps.
const STATUS_MAP = {
  clean: { label: 'Clean', fg: COLORS.green, bg: COLORS.greenSoft },
  modified: { label: 'Modified', fg: COLORS.amber, bg: COLORS.amberSoft },
  synced: { label: 'Sinkron', fg: COLORS.green, bg: COLORS.greenSoft },
  ahead: { label: 'Lokal Lebih Baru', fg: COLORS.blue, bg: COLORS.blueSoft },
  behind: { label: 'GitHub Lebih Baru', fg: COLORS.amber, bg: COLORS.amberSoft },
  diverged: { label: 'Diverged', fg: COLORS.red, bg: COLORS.redSoft },
  unknown: { label: 'Belum dicek', fg: COLORS.inkFaint, bg: COLORS.divider },
};

export function StatusBadge({ status, label }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.unknown;
  return (
    <View style={[badgeStyles.pill, { backgroundColor: cfg.bg }]}>
      <View style={[badgeStyles.dot, { backgroundColor: cfg.fg }]} />
      <Text style={[badgeStyles.label, { color: cfg.fg }]}>{label || cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 13,
    paddingHorizontal: SPACING.lg + 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
  },
  secondaryBorder: { borderWidth: 1, borderColor: COLORS.cardBorder },
  disabled: { opacity: 0.5 },
  btnText: { fontWeight: '700', fontSize: 15 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg + 2,
    marginBottom: SPACING.md + 2,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  errorBox: { backgroundColor: COLORS.redSoft, padding: 12, borderRadius: RADIUS.sm + 2, marginBottom: 12 },
  errorText: { color: COLORS.red, fontSize: 13 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.inkMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
});

const badgeStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: RADIUS.pill,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm + 2,
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '700' },
});

// Re-export supaya kode lama yang masih `import { COLORS } from './UI'`
// tidak langsung patah - tapi import baru sebaiknya langsung dari theme.js.
export { COLORS };
