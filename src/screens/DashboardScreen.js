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
 * 2. Grid "Aksi Cepat" - peta menu "nyata" hasil pemetaan 15 menu
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
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Button, Card, SectionTitle, Tile, StatusTable, SuccessBanner } from '../components/UI';
import { appAlert } from '../components/AppModals';
import { COLORS, SPACING } from '../theme';
import { getActiveRepo, listLocalRepos } from '../git/localRepos';
import { getRepoStatusSummary } from '../git/repoStatus';
import { timeAgo } from '../utils/format';

const RECENT_MS = 30 * 60 * 1000; // 30 menit - ambang "baru-baru ini" buat banner

function soonAlert(fase, nama) {
  appAlert('Belum tersedia', `"${nama}" direncanakan di Fase ${fase} (lihat dokumen konsep Bagian 7). Belum bisa dipakai sekarang.`);
}

export default function DashboardScreen({ profile, refreshKey, onNavigateTab, onOpenCompare, onOpenStorageManager, onOpenUpload, onOpenWorkingTree, onOpenSync, onOpenStash, onOpenBranch, onOpenMerge }) {
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

  const aheadNum = Number(summary?.ahead) || 0;
  const behindNum = Number(summary?.behind) || 0;
  const aheadBehindTone = aheadNum > 0 && behindNum > 0 ? 'danger' : behindNum > 0 ? 'warning' : aheadNum > 0 ? 'success' : undefined;
  const changedTone = summary?.changedFiles > 0 ? 'warning' : 'success';

  const rows = summary
    ? [
        { label: 'Repository aktif', value: summary.repoName },
        { label: 'Lokasi Repository', value: summary.location },
        { label: 'Branch aktif', value: summary.branch },
        { label: 'Remote', value: summary.remote },
        { label: 'Terhubung (Connected)', value: summary.connected },
        { label: 'Upstream', value: summary.upstream },
        { label: 'Status Git', value: summary.statusLabel, tone: changedTone },
        { label: 'Ahead / Behind', value: `${summary.ahead} ahead / ${summary.behind} behind`, tone: aheadBehindTone },
        { label: 'Commit terakhir', value: summary.lastCommit },
        { label: 'Jumlah file berubah', value: String(summary.changedFiles), tone: changedTone },
        { label: 'Terakhir Push', value: summary.lastPush },
        { label: 'Terakhir Pull', value: summary.lastPull },
        { label: 'Tanggal & Jam', value: summary.now },
      ]
    : [];

  // Menu "nyata" hasil pemetaan dari 15 menu CLI asli. Cek Update
  // (diganti mekanisme Play Store) dan Log Debug (digabung ke Log
  // Aktivitas/Export Debug Log) sudah gak jadi menu terpisah. Push dan
  // Pull SENGAJA dipisah jadi 2 tile (bukan digabung "Push & Pull")
  // sejak 7 Agustus 2026 - permintaan Zen biar sama kayak CLI, dua-duanya
  // bisa dipanggil kapan pun terlepas dari status Compare. Urutan
  // ngikutin urutan menu CLI aslinya.
  const menuTiles = [
    { icon: 'github', label: 'Repository (GitHub)', onPress: () => onNavigateTab('github') },
    { icon: 'folder', label: 'Local Repos', onPress: () => onNavigateTab('local') },
    {
      icon: 'git-branch',
      label: 'Branch',
      onPress: () => (active ? onOpenBranch(active) : appAlert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    {
      icon: 'upload',
      label: 'Upload',
      onPress: () => (active ? onOpenUpload(active) : appAlert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    {
      icon: 'edit-3',
      label: 'Git Add & Commit',
      onPress: () => (active ? onOpenWorkingTree(active) : appAlert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    {
      icon: 'upload-cloud',
      label: 'Push',
      onPress: () => (active ? onOpenSync(active, 'push') : appAlert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    {
      icon: 'download-cloud',
      label: 'Pull',
      onPress: () => (active ? onOpenSync(active, 'pull') : appAlert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    {
      icon: 'git-merge',
      label: 'Merge & PR',
      onPress: () => (active ? onOpenMerge(active) : appAlert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    { icon: 'archive', label: 'Backup', soon: 7, onPress: () => soonAlert(7, 'Backup') },
    { icon: 'bar-chart-2', label: 'Storage Manager', onPress: onOpenStorageManager },
    {
      icon: 'inbox',
      label: 'Stash',
      onPress: () => (active ? onOpenStash(active) : appAlert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    {
      icon: 'repeat',
      label: 'Compare Repo Aktif',
      onPress: () => (active ? onOpenCompare(active) : appAlert('Belum ada repo aktif', 'Pilih repo aktif dulu di tab Local Repos.')),
    },
    { icon: 'book-open', label: 'Belajar Git', soon: 8, onPress: () => soonAlert(8, 'Belajar Git') },
    { icon: 'file-text', label: 'Log & Debug', badge: 'versi awal', onPress: () => onNavigateTab('settings') },
    { icon: 'settings', label: 'Pengaturan', onPress: () => onNavigateTab('settings') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }} showsVerticalScrollIndicator={false}>
      <SectionTitle>Dashboard</SectionTitle>

      {!loading && summary?.lastPushMs && Date.now() - summary.lastPushMs < RECENT_MS ? (
        <SuccessBanner>
          Branch "{summary.branch}" baru saja di-push ({timeAgo(summary.lastPushMs)}){summary.branch !== active?.defaultBranch ? ' - siap dibuatin Pull Request kalau perlu.' : '.'}
        </SuccessBanner>
      ) : null}
      {!loading && summary?.lastPushMs && Date.now() - summary.lastPushMs < RECENT_MS && summary.branch !== active?.defaultBranch ? (
        <Button title="Buat Pull Request" variant="secondary" onPress={() => onOpenMerge(active)} style={{ marginTop: -SPACING.sm, marginBottom: SPACING.md }} />
      ) : null}
      {!loading && summary?.lastPullMs && Date.now() - summary.lastPullMs < RECENT_MS ? (
        <SuccessBanner>Branch "{summary.branch}" baru saja di-pull ({timeAgo(summary.lastPullMs)}).</SuccessBanner>
      ) : null}

      <Card>
        {loading ? <ActivityIndicator color={COLORS.accent} /> : <StatusTable rows={rows} />}
      </Card>

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
  summary: { fontSize: 12, color: COLORS.inkFaint, marginTop: SPACING.sm, marginBottom: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
