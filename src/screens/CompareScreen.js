/**
 * CompareScreen.js
 * Fase 1 (Compare 4 status) - Push/Pull/Force Push logic sekarang di
 * useSyncActions.js (dipakai bareng sama menu Push/Pull yang berdiri
 * sendiri - permintaan Zen: pisahin kayak CLI). Compare tetap nunjukin
 * shortcut ke aksi yang direkomendasikan sesuai status, tapi Push/Pull
 * juga bisa diakses independen dari sini lewat Dashboard.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { Button, HeroCard, Card, StatusBadge, ErrorBanner, InfoBanner } from '../components/UI';
import { LoadingModal } from '../components/AppModals';
import { useBackHandler } from '../hooks/useBackHandler';
import { COLORS, SPACING } from '../theme';
import { compareRepository } from '../git/compareRepository';
import { getCurrentBranch } from '../git/branchOps';
import { useSyncActions } from '../hooks/useSyncActions';

const RECOMMENDATION = {
  synced: 'Tidak ada aksi diperlukan.',
  ahead: 'Lokal lebih baru dari GitHub. Rekomendasi: Push.',
  behind: 'GitHub lebih baru dari lokal. Rekomendasi: Pull, atau clone ulang.',
  diverged: 'Riwayat bercabang. Rekomendasi: Fetch ulang, review commit, baru merge/rebase manual.',
};

export default function CompareScreen({ repo, token, author, onBack, onOpenWorkingTree }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [branch, setBranch] = useState(repo.defaultBranch);
  const sync = useSyncActions(repo, token, author, onOpenWorkingTree);

  // BUGFIX (7 Agustus 2026): dulu selalu pakai repo.defaultBranch (nilai
  // statis dari clone) - sekarang resolve branch AKTIF SAAT INI dulu,
  // biar Compare gak nampilin/ngebandingin branch yang salah kalau user
  // udah checkout ke branch lain.
  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const currentBranch = (await getCurrentBranch(repo.dir)) || repo.defaultBranch;
      setBranch(currentBranch);
      const r = await compareRepository({ dir: repo.dir, token, remoteBranch: currentBranch });
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

  useBackHandler(() => {
    if (sync.forcePushMode) { sync.cancelForcePush(); return true; }
    return false;
  }, [sync.forcePushMode]);

  return (
    <View style={styles.container}>
      <HeroCard eyebrow="Compare Repository" title={repo.fullName} subtitle={`Branch ${branch}`} />

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
              {result.status === 'ahead' && <Button title="Push" onPress={() => sync.doPush(run)} disabled={sync.busy} />}
              {result.status === 'behind' && <Button title="Pull" onPress={() => sync.doPull(run)} disabled={sync.busy} />}
              {result.status === 'diverged' && (
                <>
                  <Button title="Pull" variant="secondary" onPress={() => sync.doPull(run)} disabled={sync.busy} />
                  <Button title="Fetch Ulang" variant="secondary" onPress={run} disabled={sync.busy} />
                  <Button title="Force Push (Berbahaya)" variant="danger" onPress={sync.startForcePush} disabled={sync.busy} />
                </>
              )}
              <Button title="Refresh" variant="secondary" onPress={run} disabled={sync.busy} />
            </View>
          </>
        ) : null}
      </Card>

      {sync.forcePushMode ? (
        <Card>
          <InfoBanner>
            Force Push akan MENIMPA riwayat commit di GitHub dengan riwayat lokal. Perubahan orang lain yang
            belum kamu pull bisa HILANG. Ketik "YA" (huruf besar) untuk lanjut.
          </InfoBanner>
          <TextInput
            style={styles.confirmInput}
            placeholder='Ketik "YA"'
            placeholderTextColor={COLORS.inkFaint}
            value={sync.confirmText}
            onChangeText={sync.setConfirmText}
            autoCapitalize="characters"
          />
          <View style={styles.actions}>
            <Button title="Lanjutkan Force Push" variant="danger" onPress={() => sync.confirmForcePush(run)} disabled={sync.confirmText !== 'YA'} />
            <Button title="Batal" variant="secondary" onPress={sync.cancelForcePush} />
          </View>
        </Card>
      ) : null}

      <Button title="Kembali" variant="secondary" onPress={onBack} />

      <LoadingModal visible={sync.busy} label={sync.busyLabel} icon="refresh-cw" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  countText: { fontSize: 13, color: COLORS.inkMuted, marginTop: SPACING.sm },
  recText: { fontSize: 13, color: COLORS.ink, marginTop: 6, fontWeight: '600' },
  actions: { marginTop: SPACING.md, gap: 4 },
  confirmInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
    fontWeight: '700',
  },
});
