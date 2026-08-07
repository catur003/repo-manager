import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Button, HeroCard, PillRow, ErrorBanner } from '../components/UI';
import { COLORS, SPACING } from '../theme';
import { listUserRepos } from '../git/reposApi';
import { preflightClone, doClone } from '../git/cloneRepo';
import { logError } from '../logging/logger';
import { formatSize } from '../utils/format';

export default function RepoListScreen({ token, onCloned }) {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null); // repo yang lagi dilihat detailnya
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState(null);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const data = await listUserRepos(token, { perPage: 50 });
      setRepos(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, query]);

  const openDetail = (repo) => setSelected(repo);
  const closeDetail = () => {
    if (cloning) return; // jangan bisa keluar di tengah clone berjalan
    setSelected(null);
    setProgress(null);
  };

  const handleClone = async (repo) => {
    const { warnings, recommendShallow } = await preflightClone(repo);
    const proceed = () => runClone(repo, recommendShallow);
    if (warnings.length) {
      Alert.alert('Sebelum clone', warnings.join('\n\n'), [
        { text: 'Batal', style: 'cancel' },
        { text: 'Lanjutkan', onPress: proceed },
      ]);
    } else {
      proceed();
    }
  };

  const runClone = async (repo, shallow) => {
    setCloning(true);
    setProgress({ phase: 'Menyiapkan...', pct: 0 });
    try {
      await doClone({
        repo,
        token,
        shallow,
        onProgress: (phase, loaded, total) => {
          const pct = total ? Math.round((loaded / total) * 100) : 0;
          setProgress({ phase, pct });
        },
      });
      setCloning(false);
      setSelected(null);
      setProgress(null);
      Alert.alert('Berhasil', `${repo.fullName} berhasil di-clone.`);
      if (onCloned) onCloned();
    } catch (e) {
      setCloning(false);
      await logError('Clone gagal dari RepoListScreen', e?.message);
      Alert.alert('Clone gagal', e.message);
    }
  };

  if (selected) {
    return (
      <View style={styles.container}>
        <HeroCard
          eyebrow={selected.private ? 'Private repo' : 'Public repo'}
          title={selected.fullName}
          subtitle={`Branch ${selected.defaultBranch} · ${formatSize(selected.sizeKb)}`}
        >
          {selected.description ? <Text style={styles.detailDesc}>{selected.description}</Text> : null}
        </HeroCard>

        {progress ? (
          <View style={{ marginTop: SPACING.md }}>
            <Text style={styles.progressText}>{progress.phase}{progress.pct ? ` — ${progress.pct}%` : ''}</Text>
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 8 }} />
          </View>
        ) : (
          <View style={{ marginTop: SPACING.md }}>
            <Button title="Clone" onPress={() => handleClone(selected)} />
            <Button title="Batal" variant="secondary" onPress={closeDetail} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Cari repo..."
        placeholderTextColor={COLORS.inkFaint}
        value={query}
        onChangeText={setQuery}
      />
      <ErrorBanner message={error} />
      {loading ? (
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.accent} />}
          contentContainerStyle={{ paddingBottom: SPACING.xl }}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada repo, atau tidak cocok dengan pencarian.</Text>}
          renderItem={({ item }) => (
            <PillRow
              icon={item.private ? '🔒' : '📦'}
              label={item.fullName}
              sublabel={`${item.private ? 'Private' : 'Public'} · ${item.defaultBranch}`}
              onPress={() => openDetail(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
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
  repoName: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  repoMeta: { fontSize: 12, color: COLORS.inkMuted, marginTop: 4 },
  emptyText: { color: COLORS.inkMuted, textAlign: 'center', marginTop: SPACING.xl },
  detailDesc: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: SPACING.sm },
  progressText: { fontSize: 13, color: COLORS.ink, textAlign: 'center' },
});
