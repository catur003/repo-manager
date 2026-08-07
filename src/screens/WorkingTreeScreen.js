/**
 * WorkingTreeScreen.js
 * Padanan menu Git Add + Commit CLI asli (digabung satu layar karena
 * alurnya memang berurutan: lihat status -> add -> commit).
 *
 * FITUR BARU (permintaan Zen, bukan dari CLI): peringatan kalau ada
 * folder berat (node_modules dkk) yang belum ke-cover .gitignore -
 * ditampilkan di atas sebelum daftar status, bukan blokir total.
 *
 * UX FIX (7 Agustus 2026, laporan Zen): dulu tiap aksi (Add/Unstage/
 * Commit) manggil load() yang nge-blank seluruh layar jadi spinner
 * tengah, padahal cuma refresh status. Sekarang dipisah:
 *  - load()    -> dipanggil sekali pas layar dibuka, BOLEH blank layar.
 *  - refresh() -> dipanggil setelah aksi berhasil, TIDAK blank layar -
 *    konten lama tetap kelihatan, cuma LoadingModal overlay yang muncul
 *    (jawaban soal "emang harus refresh layar?" - iya harus refresh biar
 *    status match keadaan git sebenarnya, tapi gak harus nge-blank).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Button, Card, SectionTitle, InfoBanner, PillRow, StatusTable, ErrorBanner } from '../components/UI';
import { LoadingModal, appAlert } from '../components/AppModals';
import { COLORS, SPACING } from '../theme';
import { REPOS_ROOT } from '../git/fsAdapter';
import {
  getDetailedStatus,
  addAll,
  addSelected,
  unstagePaths,
  commitChanges,
  getLastCommit,
  getCommitHistory,
  amendCommit,
  checkGitignoreRisk,
} from '../git/workingTree';

function repoRealDir(repo) {
  return `${REPOS_ROOT}${String(repo.dir).replace(/^\/+/, '')}`;
}

export default function WorkingTreeScreen({ repo, author, onBack }) {
  const [mode, setMode] = useState('status'); // status | history | amend
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Memproses...');
  const [status, setStatus] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState('');
  const [gitignoreRisk, setGitignoreRisk] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [lastCommit, setLastCommit] = useState(null);
  const [amendMessage, setAmendMessage] = useState('');

  const fetchStatus = useCallback(async () => {
    const [s, risk] = await Promise.all([getDetailedStatus(repo.dir), checkGitignoreRisk(repoRealDir(repo))]);
    setStatus(s);
    setGitignoreRisk(risk);
    setSelected(new Set());
  }, [repo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    await fetchStatus();
    setLoading(false);
  }, [fetchStatus]);

  // Dipanggil setelah aksi (Add/Unstage/Commit) - TIDAK setLoading(true),
  // supaya layar gak ke-blank, cuma LoadingModal yang tampil (dikontrol
  // caller lewat setBusy).
  const refresh = useCallback(async () => {
    setError('');
    await fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelect = (filepath) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filepath)) next.delete(filepath);
      else next.add(filepath);
      return next;
    });
  };

  const handleAddAll = async () => {
    setBusy(true);
    setBusyLabel('Menambahkan file...');
    try {
      await addAll(repo.dir, status.unstaged);
      await refresh();
    } catch (e) {
      setError('Gagal menambahkan file. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddSelected = async () => {
    const entries = status.unstaged.filter((e) => selected.has(e.filepath));
    if (!entries.length) {
      appAlert('Belum ada yang dipilih', 'Tap file dulu buat memilih, baru tekan tombol ini.');
      return;
    }
    setBusy(true);
    setBusyLabel('Menambahkan file terpilih...');
    try {
      await addSelected(repo.dir, entries);
      await refresh();
    } catch (e) {
      setError('Gagal menambahkan file yang dipilih.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnstageAll = async () => {
    setBusy(true);
    setBusyLabel('Membatalkan staging...');
    try {
      await unstagePaths(repo.dir, status.staged.map((e) => e.filepath));
      await refresh();
    } catch (e) {
      setError('Gagal unstage.');
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    setBusy(true);
    setBusyLabel('Membuat commit...');
    setError('');
    try {
      await commitChanges(repo.dir, message, author);
      setMessage('');
      await refresh();
      appAlert('Commit berhasil', 'Perubahan sudah tersimpan sebagai commit baru.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async () => {
    setBusy(true);
    setBusyLabel('Memuat riwayat commit...');
    const h = await getCommitHistory(repo.dir);
    setHistory(h);
    setBusy(false);
    setMode('history');
  };

  const openAmend = async () => {
    setBusy(true);
    setBusyLabel('Memuat commit terakhir...');
    const last = await getLastCommit(repo.dir);
    setLastCommit(last);
    setAmendMessage('');
    setBusy(false);
    setMode('amend');
  };

  const handleAmend = async () => {
    setBusy(true);
    setBusyLabel('Meng-amend commit...');
    setError('');
    try {
      await amendCommit(repo.dir, amendMessage, author);
      setMode('status');
      await refresh();
      appAlert('Amend berhasil', 'Commit terakhir sudah diperbarui.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  let content = null;

  if (mode === 'history') {
    content = (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Riwayat Commit</SectionTitle>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada commit di repository ini.</Text>
        ) : (
          history.map((c) => (
            <Card key={c.oid}>
              <StatusTable
                rows={[
                  { label: 'Commit', value: `${c.shortOid} — ${c.message}` },
                  { label: 'Author', value: c.author },
                  { label: 'Tanggal', value: c.date.toLocaleString() },
                ]}
              />
            </Card>
          ))
        )}
        <Button title="Kembali" variant="secondary" onPress={() => setMode('status')} />
      </ScrollView>
    );
  } else if (mode === 'amend') {
    content = (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Amend Commit Terakhir</SectionTitle>
        {!lastCommit ? (
          <ErrorBanner message="Belum ada commit untuk di-amend." />
        ) : (
          <>
            <Card>
              <StatusTable rows={[{ label: 'Pesan saat ini', value: lastCommit.message }, { label: 'Commit', value: lastCommit.shortOid }]} />
            </Card>
            <TextInput
              style={styles.input}
              placeholder="Pesan commit baru (kosongkan buat pakai pesan lama)"
              placeholderTextColor={COLORS.inkFaint}
              value={amendMessage}
              onChangeText={setAmendMessage}
              multiline
            />
            <ErrorBanner message={error} />
            <Button title="Amend Commit" onPress={handleAmend} disabled={busy} />
          </>
        )}
        <Button title="Batal" variant="secondary" onPress={() => setMode('status')} />
      </ScrollView>
    );
  } else {
    content = (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Working Tree - {repo.fullName}</SectionTitle>

        {gitignoreRisk && gitignoreRisk.uncovered.length > 0 ? (
          <InfoBanner>
            {gitignoreRisk.hasGitignore
              ? `Folder ${gitignoreRisk.uncovered.join(', ')} ada di repo ini tapi belum ke-cover .gitignore. Hati-hati kalau nge-Add, bisa ikut ke-commit.`
              : `Repo ini belum punya .gitignore, padahal ada folder ${gitignoreRisk.uncovered.join(', ')}. Sebaiknya buat .gitignore dulu sebelum Add.`}
          </InfoBanner>
        ) : null}

        <Card>
          <StatusTable
            rows={[
              { label: 'Modified', value: String(status.counts.modified) },
              { label: 'Added (staged)', value: String(status.counts.added) },
              { label: 'Deleted', value: String(status.counts.deleted) },
              { label: 'Untracked', value: String(status.counts.untracked) },
              { label: 'Clean', value: status.clean ? 'Ya' : 'Tidak' },
            ]}
          />
        </Card>

        <ErrorBanner message={error} />

        <SectionTitle>Belum di-stage ({status.unstaged.length})</SectionTitle>
        {status.unstaged.length === 0 ? (
          <Text style={styles.emptyText}>Tidak ada perubahan.</Text>
        ) : (
          <>
            {status.unstaged.map((e) => (
              <PillRow
                key={e.filepath}
                icon={selected.has(e.filepath) ? 'check-square' : 'square'}
                label={e.filepath}
                sublabel={e.category}
                onPress={() => toggleSelect(e.filepath)}
              />
            ))}
            <View style={styles.rowButtons}>
              <Button title="Add Semua" onPress={handleAddAll} disabled={busy} style={styles.rowBtn} />
              <Button title="Add Terpilih" variant="secondary" onPress={handleAddSelected} disabled={busy} style={styles.rowBtn} />
            </View>
          </>
        )}

        <SectionTitle>Sudah di-stage ({status.staged.length})</SectionTitle>
        {status.staged.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada file di staging area.</Text>
        ) : (
          <>
            {status.staged.map((e) => (
              <PillRow key={e.filepath} icon="check" label={e.filepath} sublabel={e.category} />
            ))}
            <Button title="Unstage Semua" variant="secondary" onPress={handleUnstageAll} disabled={busy} />
          </>
        )}

        <SectionTitle>Commit</SectionTitle>
        <TextInput
          style={styles.input}
          placeholder="Pesan commit"
          placeholderTextColor={COLORS.inkFaint}
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <Button title="Buat Commit" onPress={handleCommit} disabled={busy || status.staged.length === 0} />

        <View style={styles.rowButtons}>
          <Button title="Riwayat Commit" variant="secondary" onPress={openHistory} style={styles.rowBtn} />
          <Button title="Amend Commit" variant="secondary" onPress={openAmend} style={styles.rowBtn} />
        </View>

        <Button title="Tutup" variant="secondary" onPress={onBack} />
      </ScrollView>
    );
  }

  return (
    <>
      {content}
      <LoadingModal visible={busy} label={busyLabel} icon="git-commit" />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.inkMuted, marginBottom: SPACING.sm },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
    minHeight: 44,
  },
  rowButtons: { flexDirection: 'row', gap: 8, marginBottom: SPACING.sm },
  rowBtn: { flex: 1 },
});
