/**
 * SettingsScreen.js
 * Versi minimal dulu - cuma info akun + Logout, dipindah kesini dari
 * Dashboard (BUGFIX 7 Agustus 2026: Logout semestinya di tab Settings,
 * bukan nempel di Dashboard). Toggle-toggle lain (auto backup, konfirmasi
 * delete/force push, identitas commit, dst - lihat dokumen konsep Bagian
 * 4.9) menyusul di Fase 8, layar ini jadi fondasinya supaya tidak perlu
 * bongkar struktur tab lagi nanti.
 *
 * TAMBAHAN SEMENTARA (7 Agustus 2026): "Log Error (Sementara)" di bawah -
 * versi kecil dari "Export Debug Log" yang semestinya baru ada di Fase 8.
 * Dibikin cepat sekarang cuma buat bantu debug bug clone yang lagi
 * ditelusuri (supaya bisa lihat error asli tanpa pasang device ke
 * komputer/baca Metro log manual). PENGINGAT: cabut/ganti bagian ini
 * begitu layar "Log Aktivitas" + "Export Debug Log" versi beneran di
 * Fase 8 dibangun, supaya gak ada 2 cara beda buat hal yang sama.
 */

import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, SectionTitle, HeroCard, InfoBanner } from '../components/UI';
import { COLORS, SPACING } from '../theme';
import { exportDebugBundle } from '../logging/logger';

export default function SettingsScreen({ profile, onLogout, onOpenStorageManager }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleShowLog = async () => {
    setLoading(true);
    const bundle = await exportDebugBundle();
    setLog(bundle || '(Kosong - belum ada error/debug log tercatat.)');
    setLoading(false);
  };

  const handleCopy = async () => {
    if (!log) return;
    await Clipboard.setStringAsync(log);
    Alert.alert('Disalin', 'Log sudah disalin ke clipboard.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }} showsVerticalScrollIndicator={false}>
      <HeroCard eyebrow="Akun" title={profile?.name || profile?.login} subtitle={`@${profile?.login}`}>
        {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} /> : null}
      </HeroCard>

      <Button title="Logout" onPress={onLogout} variant="secondary" />

      <SectionTitle style={{ marginTop: SPACING.lg }}>Penyimpanan</SectionTitle>
      <Card>
        <Text style={styles.helperText}>
          Lihat total ruang yang dipakai repo lokal, urutkan berdasarkan ukuran/terakhir dibuka/ada perubahan
          belum di-push, dan hapus repo langsung dari sana (keputusan 10.1).
        </Text>
        <Button title="Buka Storage Manager" onPress={onOpenStorageManager} variant="secondary" />
      </Card>

      <SectionTitle style={{ marginTop: SPACING.lg }}>Log Error (Sementara)</SectionTitle>
      <InfoBanner>
        Tombol debug sementara - buat lihat pesan error asli (mis. saat clone gagal), sebelum layar "Log
        Aktivitas" versi lengkap dibangun di Fase 8. Token/kredensial sudah disamarkan otomatis.
      </InfoBanner>
      <Card>
        <Button title={loading ? 'Memuat...' : 'Tampilkan Log Error'} onPress={handleShowLog} variant="secondary" disabled={loading} />
        {log ? (
          <>
            <ScrollView style={styles.logBox} nestedScrollEnabled>
              <Text selectable style={styles.logText}>{log}</Text>
            </ScrollView>
            <Button title="Salin ke Clipboard" onPress={handleCopy} variant="secondary" />
          </>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, marginTop: SPACING.sm, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  helperText: { fontSize: 12, color: COLORS.inkMuted, marginBottom: SPACING.sm, lineHeight: 17 },
  logBox: { maxHeight: 260, backgroundColor: COLORS.bg, borderRadius: 10, padding: SPACING.sm, marginTop: SPACING.sm, marginBottom: SPACING.sm },
  logText: { fontSize: 11, color: COLORS.ink, fontFamily: 'monospace' },
});
