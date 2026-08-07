import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Alert, TextInput, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Feather } from '@expo/vector-icons';
import { Button, StatusBadge, PillRow } from '../components/UI';
import { COLORS, SPACING, RADIUS } from '../theme';
import {
  listLocalRepos,
  toggleFavorite,
  setActiveRepo,
  getActiveRepo,
  removeLocalRepo,
  touchLastOpened,
} from '../git/localRepos';
import { getWorkingTreeStatus } from '../git/compareRepository';
import { logActivity, logError } from '../logging/logger';
import { timeAgo } from '../utils/format';

export default function LocalReposScreen({ token, onOpenCompare, onOpenUpload }) {
  const [repos, setRepos] = useState([]);
  const [statuses, setStatuses] = useState({}); // id -> 'clean' | 'modified'
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const list = await listLocalRepos();
    setRepos(list);
    const active = await getActiveRepo();
    setActiveId(active?.id || null);

    // Cek status working tree tiap repo (Clean/Modified) - dilakukan
    // paralel, tapi gagal per-repo tidak menggagalkan yang lain.
    const entries = await Promise.all(
      list.map(async (r) => {
        try {
          const s = await getWorkingTreeStatus(r.dir);
          return [r.id, s];
        } catch {
          return [r.id, 'unknown'];
        }
      })
    );
    setStatuses(Object.fromEntries(entries));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUse = async (repo) => {
    await setActiveRepo(repo.id);
    await touchLastOpened(repo.id);
    setActiveId(repo.id);
    await logActivity(`Repo aktif diganti ke ${repo.fullName}`);
  };

  const handleFavorite = async (repo) => {
    await toggleFavorite(repo.id);
    load();
  };

  const handleDelete = (repo) => {
    Alert.alert(
      `Hapus ${repo.fullName}?`,
      'Pilih apakah data repo di HP ini juga ikut dihapus, atau cuma dikeluarkan dari daftar.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluarkan dari daftar saja',
          onPress: async () => {
            await removeLocalRepo(repo.id);
            await logActivity(`${repo.fullName} dikeluarkan dari Local Repos (data tetap ada)`);
            load();
          },
        },
        {
          text: 'Hapus data juga',
          style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(`${FileSystem.documentDirectory}repos/${repo.id}`, { idempotent: true });
              await removeLocalRepo(repo.id);
              await logActivity(`${repo.fullName} dihapus (data + daftar)`);
            } catch (e) {
              await logError(`Gagal hapus data ${repo.fullName}`, e?.message);
              Alert.alert('Gagal menghapus', 'Data repo gagal dihapus dari penyimpanan. Coba lagi.');
            }
            load();
          },
        },
      ]
    );
  };

  // Search (tabel 4.1 dokumen konsep: search_repository harusnya ada di
  // GitHub Repos DAN Local Repos - sebelumnya cuma ada di GitHub Repos).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, query]);

  const handleOpenGithub = (repo) => {
    // Pengganti open_location() CLI asli (yang buka file manager ke path
    // lokal) - di app sandbox mobile gak relevan, diganti buka halaman
    // repo di GitHub lewat browser (tabel 4.1).
    if (repo.htmlUrl) Linking.openURL(repo.htmlUrl).catch(() => {});
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Cari repo lokal..."
        placeholderTextColor={COLORS.inkFaint}
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: SPACING.xl }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {repos.length ? 'Tidak ada repo yang cocok dengan pencarian.' : 'Belum ada repo lokal. Clone repo pertamamu dari tab GitHub Repos.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.pillCard}>
            <PillRow
              icon="package"
              tone={item.id === activeId ? 'accent' : 'default'}
              label={item.fullName}
              sublabel={`${item.defaultBranch} · dibuka ${timeAgo(item.lastOpenedAt)}${item.id === activeId ? ' · Aktif' : ''}`}
              right={
                <Pressable onPress={() => handleFavorite(item)} hitSlop={8}>
                  <Feather name="star" size={20} color={item.favorite ? COLORS.amber : COLORS.inkFaint} />
                </Pressable>
              }
            />

            <View style={styles.badgeRow}>
              <StatusBadge status={statuses[item.id] || 'unknown'} />
              {item.hasLfs ? <StatusBadge status="unknown" label="Git LFS (belum didukung)" /> : null}
              {item.hasSubmodule ? <StatusBadge status="unknown" label="Punya submodule" /> : null}
            </View>

            <View style={styles.actionsRow}>
              <Button title="Gunakan" onPress={() => handleUse(item)} variant={item.id === activeId ? 'secondary' : 'primary'} style={styles.actionBtn} />
              <Button title="Compare" variant="secondary" onPress={() => onOpenCompare(item)} style={styles.actionBtn} />
              <Button title="Upload" variant="secondary" onPress={() => onOpenUpload(item)} style={styles.actionBtn} />
              <Button title="Hapus" variant="danger" onPress={() => handleDelete(item)} style={styles.actionBtn} />
            </View>
            <Button title="Lihat di GitHub" variant="secondary" onPress={() => handleOpenGithub(item)} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: SPACING.lg, paddingHorizontal: SPACING.lg },
  search: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.ink,
    marginBottom: SPACING.md,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.inkMuted, textAlign: 'center', marginTop: SPACING.xl },
  pillCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING.sm,
    marginBottom: SPACING.sm + 2,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACING.xs, marginHorizontal: SPACING.sm },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: SPACING.sm, marginHorizontal: SPACING.sm },
  actionBtn: { flex: 1, paddingHorizontal: 8 },
});
