/**
 * StorageManagerScreen.js
 * Implementasi keputusan 10.1 dokumen konsep (Bagian 10) yang sebelumnya
 * belum dibangun sama sekali di Fase 1 - cuma ada peringatan pasif <500MB
 * saat clone (di cloneRepo.js), belum ada layar manajemennya.
 *
 * Wajib ada di sini sesuai keputusan:
 * - Total ruang terpakai semua repo lokal + sisa storage HP
 * - Per-repo: ukuran di disk, kapan terakhir dibuka, status (ada
 *   perubahan belum di-push atau tidak)
 * - Sortir: Terbesar, Terlama Tidak Dibuka, Ada Perubahan Belum Push
 * - Tombol hapus per-repo langsung dari sini (dengan peringatan kalau ada
 *   commit belum di-push)
 *
 * "Ada perubahan belum di-push" dicek OFFLINE (getLocalAheadBehind, tanpa
 * fetch) - lihat catatan di compareRepository.js kenapa: mahal & rawan
 * rate-limit kalau tiap repo di-fetch cuma buat isi list ini.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Feather } from '@expo/vector-icons';
import { Button, Card, StatusBadge, SectionTitle, InfoBanner, PillRow } from '../components/UI';
import { appAlert } from '../components/AppModals';
import { COLORS, SPACING, RADIUS } from '../theme';
import { listLocalRepos, removeLocalRepo } from '../git/localRepos';
import { getDirSizeBytes, getDeviceStorageInfo } from '../git/diskUsage';
import { getLocalAheadBehind } from '../git/compareRepository';
import { REPOS_ROOT } from '../git/fsAdapter';
import { logActivity, logError } from '../logging/logger';
import { formatSize, timeAgo } from '../utils/format';

const SORTS = [
  { key: 'largest', label: 'Terbesar' },
  { key: 'stale', label: 'Terlama Tidak Dibuka' },
  { key: 'unpushed', label: 'Ada Perubahan Belum Push' },
];

export default function StorageManagerScreen({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]); // repo + sizeBytes + unpushed
  const [device, setDevice] = useState({ freeBytes: null, totalBytes: null });
  const [sort, setSort] = useState('largest');

  const load = useCallback(async () => {
    setLoading(true);
    const [repos, deviceInfo] = await Promise.all([listLocalRepos(), getDeviceStorageInfo()]);
    setDevice(deviceInfo);

    // Dijalankan berurutan (bukan Promise.all) sengaja - getDirSizeBytes
    // itu berat (baca seluruh isi .git/objects), jalanin paralel buat
    // banyak repo sekaligus bisa bikin UI thread ngos-ngosan di HP kelas
    // bawah. Lebih lambat tapi lebih aman.
    const result = [];
    for (const r of repos) {
      const sizeBytes = await getDirSizeBytes(`${REPOS_ROOT}${String(r.dir).replace(/^\/+/, '')}`);
      const { status } = await getLocalAheadBehind(r.dir, r.defaultBranch).catch(() => ({ status: 'unknown' }));
      result.push({ ...r, sizeBytes, unpushed: status === 'ahead' || status === 'diverged' });
    }
    setRows(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === 'largest') copy.sort((a, b) => b.sizeBytes - a.sizeBytes);
    else if (sort === 'stale') copy.sort((a, b) => (a.lastOpenedAt || 0) - (b.lastOpenedAt || 0));
    else if (sort === 'unpushed') copy.sort((a, b) => Number(b.unpushed) - Number(a.unpushed));
    return copy;
  }, [rows, sort]);

  const totalBytes = useMemo(() => rows.reduce((sum, r) => sum + (r.sizeBytes || 0), 0), [rows]);

  const handleDelete = (repo) => {
    const warning = repo.unpushed
      ? 'Repo ini masih punya commit yang BELUM di-push ke GitHub. Menghapus data lokal akan menghilangkan perubahan itu secara permanen.'
      : 'Data repo ini akan dihapus dari penyimpanan HP.';
    appAlert(`Hapus ${repo.fullName}?`, warning, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus data',
        style: 'danger',
        onPress: async () => {
          try {
            await FileSystem.deleteAsync(`${FileSystem.documentDirectory}repos/${repo.id}`, { idempotent: true });
            await removeLocalRepo(repo.id);
            await logActivity(`${repo.fullName} dihapus dari Storage Manager (data + daftar)`);
          } catch (e) {
            await logError(`Gagal hapus data ${repo.fullName} dari Storage Manager`, e?.message);
            appAlert('Gagal menghapus', 'Data repo gagal dihapus dari penyimpanan. Coba lagi.');
          }
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Storage Manager</Text>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backText}>Tutup</Text>
        </Pressable>
      </View>

      <InfoBanner>
        Ringkasan penyimpanan repo lokal di HP ini. Tap "Hapus" buat bebasin ruang - repo dengan commit belum
        di-push ditandai dulu sebelum dihapus.
      </InfoBanner>

      <Card>
        {loading ? (
          <ActivityIndicator color={COLORS.accent} />
        ) : (
          <>
            <Text style={styles.summaryText}>{formatSize(totalBytes / 1024)} dipakai oleh {rows.length} repo lokal</Text>
            {device.freeBytes != null ? (
              <Text style={styles.summarySub}>
                Sisa storage HP: {formatSize(device.freeBytes / 1024)}
                {device.totalBytes != null ? ` dari ${formatSize(device.totalBytes / 1024)}` : ''}
              </Text>
            ) : null}
          </>
        )}
      </Card>

      <SectionTitle>Urutkan</SectionTitle>
      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <Pressable key={s.key} onPress={() => setSort(s.key)} style={[styles.sortChip, sort === s.key && styles.sortChipActive]}>
            <Text style={[styles.sortChipText, sort === s.key && styles.sortChipTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: SPACING.xl + 56 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.accent} />}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada repo lokal.</Text>}
          renderItem={({ item }) => (
            <View style={styles.pillCard}>
              <PillRow
                icon="folder"
                tone={item.unpushed ? 'accent' : 'default'}
                label={item.fullName}
                sublabel={`${formatSize(item.sizeBytes / 1024)} · dibuka ${timeAgo(item.lastOpenedAt)}`}
              />
              <View style={styles.pillFooter}>
                {item.unpushed ? <StatusBadge status="ahead" label="Belum di-push" /> : <StatusBadge status="clean" label="Sudah sinkron" />}
                <Button title="Hapus" variant="danger" onPress={() => handleDelete(item)} style={styles.pillDeleteBtn} />
              </View>
            </View>
          )}
        />
      )}

      {/* Tombol refresh - teks biasa, bukan simbol/icon (keputusan Zen:
          jangan pernah pake icon). */}
      {!loading ? (
        <Pressable onPress={load} style={styles.fab} hitSlop={8}>
          <Feather name="refresh-cw" size={16} color={COLORS.accent} />
          <Text style={styles.fabText}>Refresh</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  backText: { fontSize: 14, fontWeight: '700', color: COLORS.accent },
  summaryText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  summarySub: { fontSize: 12, color: COLORS.inkMuted, marginTop: 4 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  sortChip: {
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  sortChipActive: { backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent },
  sortChipText: { fontSize: 12, fontWeight: '600', color: COLORS.inkMuted },
  sortChipTextActive: { color: COLORS.accent },
  emptyText: { color: COLORS.inkMuted, textAlign: 'center', marginTop: SPACING.xl },
  pillCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING.sm,
    marginBottom: SPACING.sm + 2,
  },
  pillFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingBottom: 4,
    marginTop: -4,
  },
  pillDeleteBtn: { paddingVertical: 8, paddingHorizontal: SPACING.md },
  fab: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },
});
