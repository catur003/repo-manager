/**
 * DashboardScreen.js
 * Dua bagian, sama-sama padanan langsung dashboard.py CLI asli:
 *
 * 1. Panel status - tabel label/value persis field yang ditampilkan CLI
 *    (Repository aktif, Lokasi, Branch, Remote, Terhubung, Upstream,
 *    Status Git, Ahead/Behind, Commit terakhir, Jumlah file berubah,
 *    Terakhir Push/Pull, Tanggal & Jam). Lihat repoStatus.js buat detail
 *    tiap field & kenapa Ahead/Behind dihitung offline.
 *
 * 2. Grid "Aksi Cepat" - peta ke-13 menu "nyata" hasil pemetaan 15 menu
 *    CLI asli (2 di antaranya, Cek Update & Log Debug, sudah diputuskan
 *    gak jadi menu terpisah - lihat komentar di menuTiles). Tile yang
 *    fiturnya belum dibangun tetap bisa di-tap, kasih tahu fase-nya lewat
 *    Alert (bukan dead-end diam-diam).
 *
 * TIDAK ADA ICON/EMOJI di layar ini atau komponen manapun yang dipakai
 * (HeroCard sudah gak dipakai lagi karena panel status butuh tabel penuh,
 * bukan cuma satu baris ringkasan) - keputusan Zen 7 Agustus 2026.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Card, SectionTitle, Tile, StatusTable } from '../components/UI';
import { COLORS, SPACING } from '../theme';
import { getActiveRepo, listLocalRepos } from '../git/localRepos';
import { getRepoStatusSummary } from '../git/repoStatus';

function soonAlert(fase, nama) {
  Alert.alert('Belum tersedia', `"${nama}" direncanakan di Fase ${fase} (lihat dokumen konsep Bagian 7). Belum bisa dipakai sekarang.`);
}

export default function DashboardScreen({ profile, refreshKey, onNavigateTab, onOpenCompare, onOpenStorageManager }) {
  const [summary, setSummary] = useState(null);
  const [repoCount, setRepoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, list] = await Promise.all([getActiveRepo(), listLocalRepos()]);
    setActive(a);
    setRepoCount(list.length);
    const s = await getRepoStatusSummary(a);
    setSummary(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const rows = summary
    ? [
        { label: 'Repository aktif', value: summary.repoName },
        { label: 'Lokasi Repository', value: summary.location },
        { label: 'Branch aktif', value: summary.branch },
        { label: 'Remote', value: summary.remote },
        { label: 'Terhubung (Connected)', value: summary.connected },
        { label: 'Upstream', value: summary.upstream },
        { label: 'Status Git', value: summary.statusLabel },
        { label: 'Ahead / Behind', value: `${summary.ahead} ahead / ${summary.behind} behind` },
        { label: 'Commit terakhir', value: summary.lastCommit },
        { label: 'Jumlah file berubah', value: String(summary.changedFiles) },
        { label: 'Terakhir Push', value: summary.lastPush },
        { label: 'Terakhir Pull', value: summary.lastPull },
        { label: 'Tanggal & Jam', value: summary.now },
      ]
    : [];

  // 13 menu "nyata" hasil pemetaan dari 15 menu CLI asli. Cek Update
  // (diganti mekanisme Play Store) dan Log Debug (digabung ke Log
  // Aktivitas/Export Debug Log) sudah gak jadi menu terpisah - makanya
  // dari 15 tinggal 13. Urutan ngikutin urutan menu CLI aslinya.
  const menuTiles = [
    { label: 'Repository (GitHub)', onPress: () => onNavigateTab('github') },
    { label: 'Local Repos', onPress: () => onNavigateTab('local') },
    { label: 'Branch', soon: 2, onPress: () => soonAlert(2, 'Branch') },
    { label: 'Upload', soon: 6, onPress: () => soonAlert(6, 'Upload') },
    { label: 'Git Add & Commit', soon: 3, onPress: () => soonAlert(3, 'Git Add & Commit') },
    { label: 'Push & Pull', soon: 4, onPress: () => soonAlert(4, 'Push & Pull') },
    { label: 'Merge & PR', soon: 5, onPress: () => soonAlert(5, 'Merge & Pull Request') },
    { label: 'Backup', soon: 7, onPress: () => soonAlert(7, 'Backup') },
    { label: 'Storage Manager', onPress: onOpenStorageManager },
    {
      label: 'Compare Repo Aktif',
      onPress: () => (active ? onOpenCompare(active) : Alert.alert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    { label: 'Belajar Git', soon: 8, onPress: () => soonAlert(8, 'Belajar Git') },
    { label: 'Log & Debug', badge: 'versi awal', onPress: () => onNavigateTab('settings') },
    { label: 'Pengaturan', onPress: () => onNavigateTab('settings') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }} showsVerticalScrollIndicator={false}>
      <SectionTitle>Dashboard</SectionTitle>
      <Card>
        {loading ? <ActivityIndicator color={COLORS.accent} /> : <StatusTable rows={rows} />}
      </Card>

      <Text style={styles.summary}>{repoCount} repo tersimpan di HP ini.</Text>

      <SectionTitle>Aksi Cepat</SectionTitle>
      <View style={styles.grid}>
        {menuTiles.map((t) => (
          <Tile key={t.label} label={t.label} badge={t.soon ? `Fase ${t.soon}` : t.badge} soon={!!t.soon} onPress={t.onPress} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  summary: { fontSize: 12, color: COLORS.inkFaint, marginTop: SPACING.sm, marginBottom: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
