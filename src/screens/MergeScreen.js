/**
 * MergeScreen.js
 * Padanan menu Merge CLI asli - sekarang lengkap 3 aksi:
 *  - Merge Lokal (isomorphic-git, offline)
 *  - Buat Pull Request (GitHub REST API - POST .../pulls)
 *  - Merge Pull Request (GitHub REST API - PUT .../pulls/{n}/merge,
 *    ini yang beneran "merge di GitHub", bukan lokal)
 *
 * CLI pakai `gh` CLI (subprocess) buat 2 yang terakhir - app ini
 * langsung HTTP ke api.github.com (keputusan dari dokumen konsep Bagian
 * 4.6), TIDAK butuh server apa pun.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Button, InfoBanner, SuccessBanner, PillRow, ErrorBanner, SectionTitle, TopBar } from '../components/UI';
import { LoadingModal, appAlert } from '../components/AppModals';
import { COLORS, SPACING } from '../theme';
import { listLocalBranches, deleteBranchLocal, getCurrentBranch } from '../git/branchOps';
import { mergeLocal, previewMergeDiff } from '../git/mergeOps';
import { getLastCommit } from '../git/workingTree';
import { createPullRequest, listOpenPullRequests, mergePullRequest } from '../git/pullRequestApi';
import { useBackHandler } from '../hooks/useBackHandler';

const MERGE_METHOD_LABEL = { merge: 'Merge commit', squash: 'Squash', rebase: 'Rebase' };

export default function MergeScreen({ repo, token, author, onBack }) {
  const [mode, setMode] = useState('menu'); // menu | localMerge | createPR | listPR
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Memproses...');
  const [branches, setBranches] = useState([]);
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prResult, setPrResult] = useState(null);

  const [openPRs, setOpenPRs] = useState([]);
  const [preview, setPreview] = useState(null); // { files, remaining, total } | null
  const [previewLoading, setPreviewLoading] = useState(false);

  // Otomatis muat preview begitu source+target dua-duanya udah dipilih
  // (bukan cuma pas Merge Lokal, tapi juga di alur Buat PR - biar keliatan
  // dulu apa yang beda sebelum submit).
  useEffect(() => {
    if (!source || !target || source === target) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    previewMergeDiff(repo.dir, source, target)
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, target, repo]);

  useBackHandler(() => {
    if (mode !== 'menu') {
      setMode('menu');
      setSource(null);
      setTarget(null);
      setResult(null);
      setPrResult(null);
      return true;
    }
    return false;
  }, [mode]);

  const loadBranches = async () => {
    const list = await listLocalBranches(repo.dir);
    setBranches(list);
  };

  // BUGFIX (7 Agustus 2026, laporan Zen): pilih source yang kebetulan
  // sama kayak target yang udah dipilih duluan gak nge-reset target -
  // bisa kejadian source===target lolos ke tombol Merge. Sekarang
  // otomatis dikosongin kalau ketiban gitu, wajib pilih ulang.
  const pickSource = () => {
    appAlert('Pilih Source Branch', 'Branch yang akan digabung:', [
      ...branches.map((b) => ({
        text: b,
        style: 'primary',
        onPress: () => {
          setSource(b);
          if (target === b) setTarget(null);
        },
      })),
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
          setBusyLabel('Menggabungkan...');
          setError('');
          try {
            const res = await mergeLocal(repo.dir, source, target, author);
            setBusy(false);
            if (res.conflict) {
              appAlert(
                'Merge Gagal - Conflict',
                `Ada perubahan yang bentrok dan tidak bisa digabung otomatis. Working directory TIDAK disentuh.${
                  res.restoredBranch ? ` Kamu udah dibalikin ke branch "${res.restoredBranch}".` : ''
                } Selesaikan lewat GitHub (buka Pull Request, ada conflict editor di sana), atau pakai git di komputer.`
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

  const offerDeleteSourceLocal = () => {
    appAlert('Hapus Branch Source?', `Merge sudah selesai. Hapus branch "${source}" sekarang?`, [
      { text: 'Nanti saja', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'danger',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await deleteBranchLocal(repo.dir, source, false);
            appAlert(
              r.needsForce ? 'Belum Ter-merge' : 'Terhapus',
              r.needsForce ? 'Coba hapus manual lewat menu Branch.' : `Branch "${source}" sudah dihapus.`
            );
          } catch (e) {
            appAlert('Gagal', e.message);
          } finally {
            setBusy(false);
            setMode('menu');
            setResult(null);
            setSource(null);
            setTarget(null);
          }
        },
      },
    ]);
  };

  const openCreatePR = async () => {
    setBusy(true);
    setBusyLabel('Menyiapkan...');
    const [list, current, lastCommit] = await Promise.all([
      listLocalBranches(repo.dir),
      getCurrentBranch(repo.dir),
      getLastCommit(repo.dir),
    ]);
    setBranches(list);
    const resolvedSource = current || repo.defaultBranch;
    setSource(resolvedSource);
    // BUGFIX: dulu fallback ke repo.defaultBranch kalau cuma ada 1 branch
    // - bisa jadi sama kayak source (defaultBranch === current). Sekarang
    // dibiarin null (user harus pilih manual / bakal ke-blok tombol
    // submit-nya) daripada diam-diam sama.
    const otherBranch = list.find((b) => b !== resolvedSource);
    setTarget(otherBranch || null);
    setPrTitle(lastCommit?.message || '');
    setPrBody('');
    setPrResult(null);
    setBusy(false);
    setMode('createPR');
  };

  const submitPR = () => {
    if (!prTitle.trim()) {
      appAlert('Judul Kosong', 'Judul Pull Request tidak boleh kosong.');
      return;
    }
    appAlert('Buat Pull Request?', `"${source}" -> "${target}" dengan judul "${prTitle.trim()}"`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Buat',
        style: 'success',
        onPress: async () => {
          setBusy(true);
          setBusyLabel('Membuat Pull Request...');
          try {
            const pr = await createPullRequest(token, repo.owner, repo.name, {
              title: prTitle.trim(),
              head: source,
              base: target,
              body: prBody,
            });
            setPrResult(pr);
          } catch (e) {
            appAlert(
              'Gagal Membuat PR',
              e.message.toLowerCase().includes('no commits')
                ? 'Tidak ada commit yang beda antara kedua branch ini - tidak ada yang bisa di-PR-kan.'
                : e.message
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const openListPR = async () => {
    setBusy(true);
    setBusyLabel('Mengambil daftar Pull Request...');
    try {
      const prs = await listOpenPullRequests(token, repo.owner, repo.name);
      setOpenPRs(prs);
      setMode('listPR');
    } catch (e) {
      appAlert('Gagal Mengambil PR', e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMergePR = (pr) => {
    appAlert('Metode Merge', `PR #${pr.number}: ${pr.title}`, [
      ...Object.entries(MERGE_METHOD_LABEL).map(([method, label]) => ({
        text: label,
        style: 'success',
        onPress: () => confirmMergePR(pr, method),
      })),
      { text: 'Batal', style: 'cancel' },
    ]);
  };

  const confirmMergePR = (pr, method) => {
    appAlert('Hapus Branch Setelah Merge?', `Hapus branch "${pr.headRef}" di GitHub setelah merge berhasil?`, [
      { text: 'Tidak', style: 'cancel', onPress: () => doMergePR(pr, method, false) },
      { text: 'Ya, Hapus', style: 'danger', onPress: () => doMergePR(pr, method, true) },
    ]);
  };

  const doMergePR = async (pr, method, deleteAfter) => {
    setBusy(true);
    setBusyLabel(`Merge PR #${pr.number}...`);
    try {
      const res = await mergePullRequest(token, repo.owner, repo.name, pr.number, method, deleteAfter, pr.headRef);
      appAlert(
        'Pull Request Berhasil Di-merge',
        `PR #${pr.number} sudah di-merge ke "${pr.baseRef}" di GitHub.${
          deleteAfter ? (res.branchDeleted ? ' Branch remote sudah dihapus.' : ' (Gagal hapus branch remote, hapus manual kalau perlu.)') : ''
        }`
      );
      const prs = await listOpenPullRequests(token, repo.owner, repo.name);
      setOpenPRs(prs);
    } catch (e) {
      appAlert('Gagal Merge PR', e.message);
    } finally {
      setBusy(false);
    }
  };

  let content = null;

  if (mode === 'menu') {
    content = (
      <View style={{ flex: 1 }}>
        <TopBar title="Merge & Pull Request" onBack={onBack} backLabel="Tutup" />
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
          <InfoBanner>
            Merge Lokal gabungin dua branch di HP ini (offline). Pull Request &amp; merge-nya beneran ke
            GitHub - butuh internet, dan branch source harus sudah di-push dulu.
          </InfoBanner>
          <PillRow
            icon="git-merge"
            label="Merge Lokal"
            sublabel="Gabungkan dua branch di HP (offline)"
            onPress={async () => {
              await loadBranches();
              setMode('localMerge');
            }}
          />
          <PillRow icon="git-pull-request" label="Buat Pull Request" sublabel="Ke GitHub, butuh internet" onPress={openCreatePR} />
          <PillRow icon="check-circle" label="Merge Pull Request" sublabel="Merge PR yang sudah open di GitHub" onPress={openListPR} />
        </ScrollView>
      </View>
    );
  } else if (mode === 'localMerge') {
    content = (
      <View style={{ flex: 1 }}>
        <TopBar title="Merge Lokal" onBack={() => setMode('menu')} />
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
          {branches.length < 2 ? (
            <ErrorBanner message="Minimal harus ada 2 branch untuk melakukan merge." />
          ) : result ? (
            <>
              <SuccessBanner>
                Merge "{source}" ke "{target}" berhasil{result.fastForward ? ' (fast-forward)' : ''}
                {result.alreadyMerged ? ' - branch sudah sama, tidak ada yang berubah' : ''}.
              </SuccessBanner>
              <Button title="Hapus Branch Source" variant="danger" onPress={offerDeleteSourceLocal} />
            </>
          ) : (
            <>
              <PillRow icon="git-commit" tone={source ? 'accent' : 'default'} label={source || 'Pilih Source Branch'} onPress={pickSource} />
              <PillRow
                icon="git-merge"
                tone={target ? 'accent' : 'default'}
                label={target || 'Pilih Target Branch'}
                onPress={source ? pickTarget : undefined}
                disabled={!source}
              />

              {previewLoading ? (
                <InfoBanner>Menghitung file yang beda...</InfoBanner>
              ) : preview ? (
                preview.total === 0 ? (
                  <InfoBanner>Tidak ada file yang beda - "{source}" dan "{target}" sudah sama persis.</InfoBanner>
                ) : (
                  <View style={styles.previewCard}>
                    <SectionTitle>File yang beda ({preview.total})</SectionTitle>
                    {preview.files.map((f) => (
                      <PillRow key={f} icon="file" label={f} />
                    ))}
                    {preview.remaining > 0 ? <Text style={styles.previewMore}>... dan {preview.remaining} file lainnya</Text> : null}
                  </View>
                )
              ) : null}

              <ErrorBanner message={error} />
              <Button title="Lanjutkan Merge" onPress={doMerge} disabled={!source || !target || source === target} />
            </>
          )}
        </ScrollView>
      </View>
    );
  } else if (mode === 'createPR') {
    content = (
      <View style={{ flex: 1 }}>
        <TopBar title="Buat Pull Request" onBack={() => setMode('menu')} />
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
          {prResult ? (
            <>
              <SuccessBanner>
                Pull Request #{prResult.number} berhasil dibuat: "{prResult.title}".
              </SuccessBanner>
              <Button title="Buat PR Lain" variant="secondary" onPress={openCreatePR} />
            </>
          ) : (
            <>
              <PillRow icon="git-commit" tone="accent" label={`Source: ${source || '-'}`} onPress={pickSource} />
              <PillRow icon="git-branch" tone="accent" label={`Base/Target: ${target || '-'}`} onPress={pickTarget} />

              {previewLoading ? (
                <InfoBanner>Menghitung file yang beda...</InfoBanner>
              ) : preview && preview.total > 0 ? (
                <View style={styles.previewCard}>
                  <SectionTitle>File yang beda ({preview.total})</SectionTitle>
                  {preview.files.map((f) => (
                    <PillRow key={f} icon="file" label={f} />
                  ))}
                  {preview.remaining > 0 ? <Text style={styles.previewMore}>... dan {preview.remaining} file lainnya</Text> : null}
                </View>
              ) : null}

              <TextInput
                style={styles.input}
                placeholder="Judul Pull Request"
                placeholderTextColor={COLORS.inkFaint}
                value={prTitle}
                onChangeText={setPrTitle}
              />
              <TextInput
                style={[styles.input, { minHeight: 80 }]}
                placeholder="Deskripsi (opsional)"
                placeholderTextColor={COLORS.inkFaint}
                value={prBody}
                onChangeText={setPrBody}
                multiline
              />
              <Button title="Buat Pull Request" onPress={submitPR} disabled={!source || !target || source === target} />
            </>
          )}
        </ScrollView>
      </View>
    );
  } else if (mode === 'listPR') {
    content = (
      <View style={{ flex: 1 }}>
        <TopBar title="Merge Pull Request" onBack={() => setMode('menu')} />
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
          {openPRs.length === 0 ? (
            <ErrorBanner message="Tidak ada Pull Request yang open untuk repository ini." />
          ) : (
            openPRs.map((pr) => (
              <PillRow
                key={pr.number}
                icon="git-pull-request"
                label={`#${pr.number} ${pr.title}`}
                sublabel={`${pr.headRef} -> ${pr.baseRef}`}
                onPress={() => handleMergePR(pr)}
              />
            ))
          )}
          <Button title="Refresh" variant="secondary" onPress={openListPR} />
        </ScrollView>
      </View>
    );
  }

  return (
    <>
      {content}
      <LoadingModal visible={busy} label={busyLabel} icon="git-merge" />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  previewCard: { marginBottom: SPACING.sm },
  previewMore: { fontSize: 12, color: COLORS.inkFaint, marginTop: 4, marginBottom: SPACING.sm },
});
