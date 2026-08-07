/**
 * MergeScreen.js
 * Padanan menu Merge Lokal CLI asli. Pilih source lewat action-sheet
 * (appAlert), lalu target, konfirmasi, jalankan. Kalau berhasil, tawarkan
 * hapus branch source - persis CLI.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, SectionTitle, InfoBanner, SuccessBanner, PillRow, ErrorBanner } from '../components/UI';
import { LoadingModal, appAlert } from '../components/AppModals';
import { SPACING } from '../theme';
import { listLocalBranches, deleteBranchLocal } from '../git/branchOps';
import { mergeLocal } from '../git/mergeOps';
import { useBackHandler } from '../hooks/useBackHandler';

export default function MergeScreen({ repo, author, onBack }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState([]);
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await listLocalBranches(repo.dir);
    setBranches(list);
    setLoading(false);
  }, [repo]);

  useEffect(() => {
    load();
  }, [load]);

  useBackHandler(() => {
    if (result) { setResult(null); return true; }
    if (target) { setTarget(null); return true; }
    if (source) { setSource(null); return true; }
    return false;
  }, [source, target, result]);

  const pickSource = () => {
    appAlert('Pilih Source Branch', 'Branch yang akan digabung:', [
      ...branches.map((b) => ({ text: b, style: 'primary', onPress: () => setSource(b) })),
      { text: 'Batal', style: 'cancel' },
    ]);
  };

  const pickTarget = () => {
    appAlert('Pilih Target Branch', 'Tujuan penggabungan:', [
      ...branches.filter((b) => b !== source).map((b) => ({ text: b, style: 'primary', onPress: () => setTarget(b) })),
      { text: 'Batal', style: 'cancel' },
    ]);
  };

  const doMerge = () => {
    appAlert('Lanjutkan Merge?', `"${source}" akan digabung ke dalam "${target}".`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Merge',
        style: 'success',
        onPress: async () => {
          setBusy(true);
          setError('');
          try {
            const res = await mergeLocal(repo.dir, source, target, author);
            setBusy(false);
            if (res.conflict) {
              appAlert(
                'Merge Gagal - Conflict',
                'Ada perubahan yang bentrok dan tidak bisa digabung otomatis. Working directory TIDAK disentuh (masih di kondisi sebelum merge). Selesaikan lewat GitHub (buka Pull Request, ada conflict editor di sana), atau pakai git di komputer untuk kasus ini.'
              );
              return;
            }
            setResult(res);
          } catch (e) {
            setBusy(false);
            setError(e.message);
          }
        },
      },
    ]);
  };

  const offerDeleteSource = () => {
    appAlert('Hapus Branch Source?', `Merge sudah selesai. Hapus branch "${source}" sekarang?`, [
      { text: 'Nanti saja', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'danger',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await deleteBranchLocal(repo.dir, source, false);
            if (r.needsForce) {
              appAlert('Belum Sepenuhnya Ter-merge', 'Aneh, harusnya sudah ke-merge. Coba hapus manual lewat menu Branch kalau perlu.');
            } else {
              appAlert('Terhapus', `Branch "${source}" sudah dihapus.`);
            }
          } catch (e) {
            appAlert('Gagal', e.message);
          } finally {
            setBusy(false);
            setResult(null);
            setSource(null);
            setTarget(null);
            await load();
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <SectionTitle>Merge - {repo.fullName}</SectionTitle>
      {branches.length < 2 ? (
        <ErrorBanner message="Minimal harus ada 2 branch untuk melakukan merge." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xl }}>
          {result ? (
            <>
              <SuccessBanner>
                Merge "{source}" ke "{target}" berhasil{result.fastForward ? ' (fast-forward)' : ''}
                {result.alreadyMerged ? ' - branch sudah sama, tidak ada yang berubah' : ''}.
              </SuccessBanner>
              <Button title="Hapus Branch Source" variant="danger" onPress={offerDeleteSource} />
              <Button
                title="Merge Lagi"
                variant="secondary"
                onPress={() => {
                  setResult(null);
                  setSource(null);
                  setTarget(null);
                }}
              />
            </>
          ) : (
            <>
              <InfoBanner>
                Pilih branch source (yang mau digabung) lalu target (tujuan). isomorphic-git cuma bisa
                auto-merge yang bersih - kalau ada conflict, merge dibatalkan total, tidak ada file yang
                berubah.
              </InfoBanner>
              <PillRow icon="git-commit" tone={source ? 'accent' : 'default'} label={source || 'Pilih Source Branch'} onPress={pickSource} />
              <PillRow
                icon="git-merge"
                tone={target ? 'accent' : 'default'}
                label={target || 'Pilih Target Branch'}
                onPress={source ? pickTarget : undefined}
                disabled={!source}
              />
              <ErrorBanner message={error} />
              <Button title="Lanjutkan Merge" onPress={doMerge} disabled={!source || !target} />
            </>
          )}
        </ScrollView>
      )}
      <Button title="Tutup" variant="secondary" onPress={onBack} />
      <LoadingModal visible={busy || loading} label={loading ? 'Memuat...' : 'Menggabungkan...'} icon="git-merge" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
});
