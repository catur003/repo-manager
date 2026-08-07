import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Button, Card, StatusBadge } from '../components/UI';
import { COLORS, SPACING } from '../theme';
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

function timeAgo(ts) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}

export default function LocalReposScreen({ token, onOpenCompare }) {
  const [repos, setRepos] = useState([]);
  const [statuses, setStatuses] = useState({}); // id -> 'clean' | 'modified'
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={repos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.xl }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Belum ada repo lokal. Clone repo pertamamu dari tab GitHub Repos.</Text>
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.repoName}>{item.fullName}</Text>
                <Text style={styles.repoMeta}>
                  {item.defaultBranch} · dibuka {timeAgo(item.lastOpenedAt)}
                  {item.id === activeId ? ' · Aktif' : ''}
                </Text>
              </View>
              <Pressable onPress={() => handleFavorite(item)} hitSlop={8}>
                <Text style={styles.star}>{item.favorite ? '★' : '☆'}</Text>
              </Pressable>
            </View>

            <View style={styles.badgeRow}>
              <StatusBadge status={statuses[item.id] || 'unknown'} />
              {item.hasLfs ? <StatusBadge status="unknown" label="Git LFS (belum didukung)" /> : null}
              {item.hasSubmodule ? <StatusBadge status="unknown" label="Punya submodule" /> : null}
            </View>

            <View style={styles.actionsRow}>
              <Button title="Gunakan" onPress={() => handleUse(item)} variant={item.id === activeId ? 'secondary' : 'primary'} style={styles.actionBtn} />
              <Button title="Compare" variant="secondary" onPress={() => onOpenCompare(item)} style={styles.actionBtn} />
              <Button title="Hapus" variant="danger" onPress={() => handleDelete(item)} style={styles.actionBtn} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.inkMuted, textAlign: 'center', marginTop: SPACING.xl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  repoName: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  repoMeta: { fontSize: 12, color: COLORS.inkMuted, marginTop: 4 },
  star: { fontSize: 20, color: COLORS.amber, marginLeft: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACING.sm },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: SPACING.md },
  actionBtn: { flex: 1, paddingHorizontal: 8 },
});
