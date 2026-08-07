/**
 * CompareScreen.js
 * Fase 1 (Compare 4 status) + Fase 4 (Push/Pull) digabung di sini -
 * alurnya memang nyambung: lihat status dulu, baru pilih aksi sync.
 *
 * Force Push WAJIB ketik ulang "YA" persis (bukan cuma tap tombol) -
 * dipertahankan dari CLI asli (Bagian 6.3 dokumen konsep: pengaman
 * kritikal, bukan sekadar dialog Ya/Tidak).
 *
 * Pull yang diblokir karena working tree kotor: lihat catatan lengkap di
 * syncRepo.js kenapa (isomorphic-git gak punya "git stash").
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { Button, HeroCard, Card, StatusBadge, ErrorBanner, InfoBanner } from '../components/UI';
import { LoadingModal, appAlert } from '../components/AppModals';
import { COLORS, SPACING } from '../theme';
import { compareRepository } from '../git/compareRepository';
import { pushRepo, pullRepo, forcePushRepo } from '../git/syncRepo';

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
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Memproses...');
  const [forcePushMode, setForcePushMode] = useState(false);
  const [confirmText, setConfirmText] = useState('');

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

  const handlePull = async () => {
    setBusy(true);
    setBusyLabel('Mengambil (pull)...');
    try {
      const res = await pullRepo(repo.dir, repo.defaultBranch, token, author);
      setBusy(false);
      if (res.blockedDirty) {
        appAlert(
          'Ada perubahan belum di-commit',
          'Pull ditunda supaya perubahanmu gak ketimpa. Commit dulu perubahan yang ada, baru Pull lagi.',
          [
            { text: 'Nanti saja', style: 'cancel' },
            { text: 'Buka Working Tree', style: 'primary', onPress: () => onOpenWorkingTree(repo) },
          ]
        );
        return;
      }
      appAlert('Pull Berhasil', 'Perubahan terbaru dari GitHub sudah digabung.');
      await run();
    } catch (e) {
      setBusy(false);
      appAlert('Pull Gagal', e.message);
    }
  };

  const handlePush = async () => {
    setBusy(true);
    setBusyLabel('Mengirim (push)...');
    try {
      const res = await pushRepo(repo.dir, repo.defaultBranch, token);
      setBusy(false);
      if (res.rejected) {
        // BUGFIX yang sama seperti CLI: dulu mentok kalau ditolak, sekarang
        // langsung ditawarkan Pull dari sini.
        appAlert('Push ditolak', 'Ada perubahan baru di GitHub. Pull dulu, baru coba Push lagi?', [
          { text: 'Batal', style: 'cancel' },
          { text: 'Pull Sekarang', style: 'primary', onPress: handlePull },
        ]);
        return;
      }
      appAlert('Push Berhasil', `Repository: ${repo.fullName}\nBranch: ${repo.defaultBranch}`);
      await run();
    } catch (e) {
      setBusy(false);
      appAlert('Push Gagal', e.message);
    }
  };

  const handleForcePushConfirmed = async () => {
    setForcePushMode(false);
    setConfirmText('');
    setBusy(true);
    setBusyLabel('Force Push...');
    try {
      await forcePushRepo(repo.dir, repo.defaultBranch, token);
      setBusy(false);
      appAlert('Force Push Berhasil', 'Riwayat commit di GitHub sudah ditimpa dengan riwayat lokal.');
      await run();
    } catch (e) {
      setBusy(false);
      appAlert('Force Push Gagal', e.message);
    }
  };

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
              {result.status === 'ahead' && <Button title="Push" onPress={handlePush} disabled={busy} />}
              {result.status === 'behind' && <Button title="Pull" onPress={handlePull} disabled={busy} />}
              {result.status === 'diverged' && (
                <>
                  <Button title="Fetch Ulang" variant="secondary" onPress={run} disabled={busy} />
                  <Button title="Force Push (Berbahaya)" variant="danger" onPress={() => setForcePushMode(true)} disabled={busy} />
                </>
              )}
              <Button title="Refresh" variant="secondary" onPress={run} disabled={busy} />
            </View>
          </>
        ) : null}
      </Card>

      {forcePushMode ? (
        <Card>
          <InfoBanner>
            Force Push akan MENIMPA riwayat commit di GitHub dengan riwayat lokal. Perubahan orang lain yang
            belum kamu pull bisa HILANG. Ketik "YA" (huruf besar) untuk lanjut.
          </InfoBanner>
          <TextInput
            style={styles.confirmInput}
            placeholder='Ketik "YA"'
            placeholderTextColor={COLORS.inkFaint}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
          />
          <View style={styles.actions}>
            <Button title="Lanjutkan Force Push" variant="danger" onPress={handleForcePushConfirmed} disabled={confirmText !== 'YA'} />
            <Button
              title="Batal"
              variant="secondary"
              onPress={() => {
                setForcePushMode(false);
                setConfirmText('');
              }}
            />
          </View>
        </Card>
      ) : null}

      <Button title="Kembali" variant="secondary" onPress={onBack} />

      <LoadingModal visible={busy} label={busyLabel} icon="refresh-cw" />
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
