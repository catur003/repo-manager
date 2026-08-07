import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Button, HeroCard, Card, StatusBadge, ErrorBanner } from '../components/UI';
import { COLORS, SPACING } from '../theme';
import { compareRepository } from '../git/compareRepository';

const RECOMMENDATION = {
  synced: 'Tidak ada aksi diperlukan.',
  ahead: 'Lokal lebih baru dari GitHub. Rekomendasi: Push.',
  behind: 'GitHub lebih baru dari lokal. Rekomendasi: Pull, atau clone ulang.',
  diverged: 'Riwayat bercabang. Rekomendasi: Fetch ulang, review commit, baru merge/rebase manual.',
};

export default function CompareScreen({ repo, token, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await compareRepository({ dir: repo.dir, token, remoteBranch: repo.defaultBranch });
      setResult(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [repo, token]);

  useEffect(() => {
    run();
  }, [run]);

  // Push/Pull sungguhan baru dibangun di Fase 4 (dokumen konsep Bagian 7) -
  // tombol tetap ditampilkan supaya alurnya jelas, tapi jujur kasih tahu
  // belum aktif, daripada diam-diam tidak melakukan apa-apa.
  const notYetAvailable = (action) => Alert.alert('Belum tersedia', `${action} akan dibangun di Fase 4 (Sync).`);

  return (
    <View style={styles.container}>
      <HeroCard eyebrow="Compare Repository" title={repo.fullName} subtitle={`Branch ${repo.defaultBranch}`} />

      <Card>
        <ErrorBanner message={error} />
        {loading ? (
          <ActivityIndicator color={COLORS.accent} />
        ) : result ? (
          <>
            <StatusBadge status={result.status} />
            <Text style={styles.countText}>
              {result.ahead} commit ahead · {result.behind} commit behind
            </Text>
            <Text style={styles.recText}>{RECOMMENDATION[result.status]}</Text>

            <View style={styles.actions}>
              {result.status === 'ahead' && <Button title="Push" onPress={() => notYetAvailable('Push')} />}
              {result.status === 'behind' && <Button title="Pull" onPress={() => notYetAvailable('Pull')} />}
              {result.status === 'diverged' && (
                <>
                  <Button title="Fetch Ulang" variant="secondary" onPress={run} />
                  <Button title="Merge/Rebase Manual" onPress={() => notYetAvailable('Merge/Rebase')} />
                </>
              )}
              <Button title="Refresh" variant="secondary" onPress={run} />
            </View>
          </>
        ) : null}
      </Card>

      <Button title="Kembali" variant="secondary" onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  countText: { fontSize: 13, color: COLORS.inkMuted, marginTop: SPACING.sm },
  recText: { fontSize: 13, color: COLORS.ink, marginTop: 6, fontWeight: '600' },
  actions: { marginTop: SPACING.md, gap: 4 },
});
