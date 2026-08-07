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
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
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

/** Banner info gaya "Beta, read-only..." di File Viewer zenvps - kotak
 * lavender lembut buat catatan/instruksi, bukan error. */
export function InfoBanner({ children }) {
  return (
    <View style={infoStyles.box}>
      <Text style={infoStyles.text}>{children}</Text>
    </View>
  );
}

export function SectionTitle({ children, style }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

/**
 * PillRow - baris list bulat penuh (stadium shape), gaya "File Viewer"
 * zenvps: icon (Feather, vector - bukan emoji) di lingkaran kiri + label,
 * satu baris per item.
 */
export function PillRow({ icon, label, sublabel, onPress, right, tone = 'default', disabled = false }) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        pillStyles.row,
        tone === 'accent' && pillStyles.rowAccent,
        disabled && { opacity: 0.5 },
        pressed && onPress && !disabled ? { opacity: 0.7 } : null,
      ]}
    >
      {icon ? (
        <View style={[pillStyles.iconWrap, tone === 'accent' && pillStyles.iconWrapAccent]}>
          <Feather name={icon} size={16} color={tone === 'accent' ? COLORS.onAccent : COLORS.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={pillStyles.label} numberOfLines={1}>{label}</Text>
        {sublabel ? <Text style={pillStyles.sublabel} numberOfLines={1}>{sublabel}</Text> : null}
      </View>
      {right}
    </Wrapper>
  );
}

/**
 * Tile - kartu menu persegi buat grid "Aksi Cepat" ala zenvps Dashboard.
 * Icon Feather (vector) di atas label - bukan emoji.
 * `soon` = fitur belum dibangun (bukan dead-end diam-diam - tetap bisa
 * di-tap tapi kasih tahu status fase-nya, sama pola dengan tombol
 * Push/Pull di CompareScreen).
 */
export function Tile({ icon, label, badge, soon, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [tileStyles.tile, pressed && { opacity: 0.75 }, soon && tileStyles.tileSoon]}>
      {icon ? (
        <View style={[tileStyles.iconWrap, soon && tileStyles.iconWrapSoon]}>
          <Feather name={icon} size={18} color={soon ? COLORS.inkFaint : COLORS.accent} />
        </View>
      ) : null}
      <Text style={tileStyles.label} numberOfLines={2}>{label}</Text>
      {badge ? <Text style={tileStyles.badge}>{badge}</Text> : null}
    </Pressable>
  );
}

/** Kartu hero gradasi-semu ala "Server Online" zenvps - RN gak punya
 * gradient bawaan tanpa dependency native baru, jadi didekati pakai warna
 * solid COLORS.accent + blob translucent dekoratif (pola sama dengan
 * AuroraBackground, cuma dipakai lokal di satu kartu). */
export function HeroCard({ eyebrow, title, subtitle, children }) {
  return (
    <View style={heroStyles.card}>
      <View style={heroStyles.blobA} />
      <View style={heroStyles.blobB} />
      <View style={heroStyles.content}>
        {eyebrow ? <Text style={heroStyles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={heroStyles.title}>{title}</Text>
        {subtitle ? <Text style={heroStyles.subtitle}>{subtitle}</Text> : null}
        {children}
      </View>
    </View>
  );
}

/**
 * StatusTable - tabel label/value dua kolom, gaya panel "Dashboard" CLI
 * asli (dashboard.py: Repository aktif, Branch aktif, Remote, dst).
 * `rows`: [{ label, value }]. Baris dengan `value` kosong/'-' tetap
 * ditampilkan (bukan disembunyikan) - konsisten sama CLI yang selalu
 * nunjukin semua field walau isinya "-".
 */
export function StatusTable({ rows }) {
  return (
    <View>
      {rows.map((r, i) => (
        <View key={i} style={[statusTableStyles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={statusTableStyles.label}>{r.label}</Text>
          <Text style={statusTableStyles.value} numberOfLines={2}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
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

const infoStyles = StyleSheet.create({
  box: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADIUS.lg,
    padding: SPACING.md + 2,
    marginBottom: SPACING.md,
  },
  text: { fontSize: 13, color: COLORS.ink, lineHeight: 19 },
});

const pillStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm + 2,
    marginBottom: SPACING.sm,
    gap: SPACING.sm + 2,
  },
  rowAccent: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapAccent: { backgroundColor: COLORS.accent },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  sublabel: { fontSize: 12, color: COLORS.inkMuted, marginTop: 2 },
});

const tileStyles = StyleSheet.create({
  tile: {
    flexBasis: '31%',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 76,
    marginBottom: SPACING.sm + 2,
  },
  tileSoon: { opacity: 0.6 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  iconWrapSoon: { backgroundColor: COLORS.divider },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.ink, textAlign: 'center', lineHeight: 14 },
  badge: { fontSize: 9, fontWeight: '700', color: COLORS.inkFaint, marginTop: 4, textAlign: 'center' },
});

const heroStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg + 2,
    marginBottom: SPACING.md + 2,
    overflow: 'hidden',
  },
  blobA: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.14)',
    top: -60,
    right: -40,
  },
  blobB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.10)',
    bottom: -50,
    left: -30,
  },
  content: {},
  eyebrow: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 19, fontWeight: '800', color: '#FFFFFF', marginTop: 4 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
});

const statusTableStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  label: { width: 150, fontSize: 12, fontWeight: '700', color: COLORS.inkMuted },
  value: { flex: 1, fontSize: 12, color: COLORS.ink, fontFamily: 'monospace' },
});

// Re-export supaya kode lama yang masih `import { COLORS } from './UI'`
// tidak langsung patah - tapi import baru sebaiknya langsung dari theme.js.
export { COLORS };
