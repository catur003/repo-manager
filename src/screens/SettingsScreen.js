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

import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, SectionTitle, HeroCard, InfoBanner } from '../components/UI';
import { appAlert } from '../components/AppModals';
import { COLORS, SPACING } from '../theme';
import { exportDebugBundle, readErrorLog, readDebugLog } from '../logging/logger';
import { getSetting, setSetting } from '../git/settingsStore';

export default function SettingsScreen({ profile, onLogout, onOpenStorageManager }) {
  const [errorLog, setErrorLog] = useState(null);
  const [debugLog, setDebugLog] = useState(null);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoStash, setAutoStash] = useState(true);

  useEffect(() => {
    getSetting('autoStash').then((v) => setAutoStash(v !== false));
  }, []);

  const handleToggleAutoStash = async (value) => {
    setAutoStash(value);
    await setSetting('autoStash', value);
  };

  const handleShowLog = async () => {
    setLoading(true);
    const [err, dbg] = await Promise.all([readErrorLog(), readDebugLog()]);
    setErrorLog(err || '(Kosong - belum ada error tercatat.)');
    setDebugLog(dbg || '(Kosong - belum ada jejak debug tercatat.)');
    setLoading(false);
  };

  const handleCopy = async () => {
    const bundle = await exportDebugBundle();
    await Clipboard.setStringAsync(bundle || '(kosong)');
    appAlert('Disalin', 'Error Log + Debug Log sudah disalin ke clipboard.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }} showsVerticalScrollIndicator={false}>
      <HeroCard eyebrow="Akun" title={profile?.name || profile?.login} subtitle={`@${profile?.login}`}>
        {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} /> : null}
      </HeroCard>

      <Button title="Logout" onPress={onLogout} variant="secondary" />

      <SectionTitle style={{ marginTop: SPACING.lg }}>Sinkronisasi</SectionTitle>
      <Card>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Auto-stash sebelum Pull</Text>
            <Text style={styles.helperText}>
              Kalau nyala: perubahan lokal yang belum di-commit otomatis disimpan sementara (stash) sebelum
              Pull, lalu diterapkan balik setelahnya. Kalau dimatikan: Pull ditolak dulu kalau ada perubahan
              belum di-commit, kamu diminta commit manual duluan.
            </Text>
          </View>
          <Switch value={autoStash} onValueChange={handleToggleAutoStash} trackColor={{ true: COLORS.accent }} />
        </View>
      </Card>

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
        <Button title={loading ? 'Memuat...' : 'Tampilkan Log'} onPress={handleShowLog} variant="secondary" disabled={loading} />

        {errorLog !== null ? (
          <>
            {/* BUGFIX (laporan Zen): dulu Error Log + Debug Log digabung
                jadi 1 kotak scroll panjang - Error Log (paling penting)
                gampang ke-"kubur" Debug Log yang jauh lebih sering nambah
                (mis. listUserRepos). Sekarang dipisah 2 kotak jelas,
                Error Log ditaruh duluan & warna beda biar gak ketuker. */}
            <View style={styles.logHeaderRow}>
              <View style={styles.logHeaderDotError} />
              <Text style={styles.logHeaderText}>ERROR LOG</Text>
            </View>
            <ScrollView style={[styles.logBox, styles.errorLogBox]} nestedScrollEnabled>
              <Text selectable style={styles.logText}>{errorLog}</Text>
            </ScrollView>

            <Button
              title={showDebugLog ? 'Sembunyikan Debug Log' : 'Tampilkan Debug Log Juga'}
              onPress={() => setShowDebugLog((v) => !v)}
              variant="secondary"
            />
            {showDebugLog ? (
              <>
                <View style={styles.logHeaderRow}>
                  <View style={styles.logHeaderDotDebug} />
                  <Text style={styles.logHeaderText}>DEBUG LOG</Text>
                </View>
                <ScrollView style={styles.logBox} nestedScrollEnabled>
                  <Text selectable style={styles.logText}>{debugLog}</Text>
                </ScrollView>
              </>
            ) : null}

            <Button title="Salin Semua ke Clipboard" onPress={handleCopy} variant="secondary" />
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: COLORS.ink, marginBottom: 4 },
  logBox: { maxHeight: 220, backgroundColor: COLORS.bg, borderRadius: 10, padding: SPACING.sm, marginBottom: SPACING.sm },
  errorLogBox: { borderWidth: 1, borderColor: COLORS.red },
  logHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, marginBottom: 4 },
  logHeaderDotError: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red },
  logHeaderDotDebug: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.inkFaint },
  logHeaderText: { fontSize: 11, fontWeight: '800', color: COLORS.inkMuted, letterSpacing: 0.5 },
  logText: { fontSize: 11, color: COLORS.ink, fontFamily: 'monospace' },
});
