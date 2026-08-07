/**
 * DashboardScreen.js
 * Dirombak (7 Agustus 2026) jadi "peta menu" ala zenvps Dashboard, sambil
 * jawab pertanyaan Zen: dari 15 menu mentah di CLI asli, 2 di antaranya
 * (Cek Update -> diganti mekanisme Play Store, Log Debug -> digabung ke
 * Log Aktivitas/Export Debug Log) sudah diputuskan gak jadi menu terpisah
 * di app - sisa 13 menu "nyata" dipetakan semua ke grid "Aksi Cepat" di
 * bawah, biar IA app ini transparan ngikutin struktur menu CLI, bukan
 * nebak-nebak fitur ilang kemana.
 *
 * Tile yang fiturnya belum dibangun tetap BISA di-tap (bukan dead-end
 * diam-diam, sesuai aturan kerja CLI asli) - munculin info fase-nya lewat
 * Alert, pola yang sama dipakai tombol Push/Pull di CompareScreen.
 *
 * Hero card & Tile pakai komponen baru di UI.js (HeroCard, Tile) yang
 * didekati gaya zenvps TANPA nambah dependency native baru (gradient
 * didekati blob translucent, bukan expo-linear-gradient - lihat catatan
 * di UI.js).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { HeroCard, StatusBadge, SectionTitle, Tile } from '../components/UI';
import { COLORS, SPACING } from '../theme';
import { getActiveRepo, listLocalRepos } from '../git/localRepos';
import { getWorkingTreeStatus } from '../git/compareRepository';

const STATUS_LABEL = {
  clean: 'Bersih, tidak ada perubahan',
  modified: 'Ada file yang belum di-commit',
  unknown: 'Status belum dicek',
};

function soonAlert(fase, nama) {
  Alert.alert('Belum tersedia', `"${nama}" direncanakan di Fase ${fase} (lihat dokumen konsep Bagian 7). Belum bisa dipakai sekarang.`);
}

export default function DashboardScreen({ profile, refreshKey, onNavigateTab, onOpenCompare, onOpenStorageManager }) {
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState('unknown');
  const [repoCount, setRepoCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, list] = await Promise.all([getActiveRepo(), listLocalRepos()]);
    setActive(a);
    setRepoCount(list.length);
    if (a) {
      const s = await getWorkingTreeStatus(a.dir).catch(() => 'unknown');
      setStatus(s);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // 13 menu "nyata" hasil pemetaan dari 15 menu CLI asli (lihat catatan
  // di atas). Urutan sengaja ngikutin urutan menu CLI aslinya, bukan
  // diacak, supaya orang yang familiar sama CLI gampang nemuin padanannya.
  const menuTiles = [
    { icon: '📦', label: 'Repository (GitHub)', onPress: () => onNavigateTab('github') },
    { icon: '💾', label: 'Local Repos', onPress: () => onNavigateTab('local') },
    { icon: '🌿', label: 'Branch', soon: 2, onPress: () => soonAlert(2, 'Branch') },
    { icon: '📤', label: 'Upload', soon: 6, onPress: () => soonAlert(6, 'Upload') },
    { icon: '📝', label: 'Git Add & Commit', soon: 3, onPress: () => soonAlert(3, 'Git Add & Commit') },
    { icon: '🔄', label: 'Push & Pull', soon: 4, onPress: () => soonAlert(4, 'Push & Pull') },
    { icon: '🔀', label: 'Merge & PR', soon: 5, onPress: () => soonAlert(5, 'Merge & Pull Request') },
    { icon: '🗄️', label: 'Backup', soon: 7, onPress: () => soonAlert(7, 'Backup') },
    { icon: '📊', label: 'Storage Manager', onPress: onOpenStorageManager },
    {
      icon: '⇄',
      label: 'Compare Repo Aktif',
      onPress: () => (active ? onOpenCompare(active) : Alert.alert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    { icon: '🎓', label: 'Belajar Git', soon: 8, onPress: () => soonAlert(8, 'Belajar Git') },
    { icon: '📜', label: 'Log & Debug', badge: 'versi awal', onPress: () => onNavigateTab('settings') },
    { icon: '⚙️', label: 'Pengaturan', onPress: () => onNavigateTab('settings') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }} showsVerticalScrollIndicator={false}>
      <HeroCard
        eyebrow={`Halo, ${profile?.login || ''}`}
        title={active ? active.fullName : 'Belum ada repo aktif'}
        subtitle={active ? `Branch ${active.defaultBranch} · ${STATUS_LABEL[status] || STATUS_LABEL.unknown}` : 'Clone atau pilih repo dulu dari menu di bawah.'}
      >
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: SPACING.sm, alignSelf: 'flex-start' }} />
        ) : active ? (
          <View style={{ marginTop: SPACING.sm }}>
            <StatusBadge status={status} />
          </View>
        ) : null}
      </HeroCard>

      <Text style={styles.summary}>{repoCount} repo tersimpan di HP ini.</Text>

      <SectionTitle>Aksi Cepat</SectionTitle>
      <View style={styles.grid}>
        {menuTiles.map((t) => (
          <Tile key={t.label} icon={t.icon} label={t.label} badge={t.soon ? `Fase ${t.soon}` : t.badge} soon={!!t.soon} onPress={t.onPress} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  summary: { fontSize: 12, color: COLORS.inkFaint, marginBottom: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
