/**
 * UploadScreen.js
 * Padanan menu Upload CLI asli (upload.py, modul terbesar - 805 baris).
 * 3 dari 4 aksi CLI diimplementasi: Upload File, Upload ZIP (Extract),
 * Upload ZIP (No Extract). "Upload Folder" SENGAJA belum - dokumen konsep
 * sendiri (Bagian 4.7) sudah menandai ini sebagai "dievaluasi ketersediaan
 * API OS" karena gak ada folder-picker universal Android+iOS yang
 * konsisten - jadi bukan kelupaan, memang nunggu keputusan terpisah.
 *
 * Sumber file dipilih lewat expo-document-picker (pengganti resmi
 * Downloads/Home/Browse/Manual Path CLI - tabel 4.7 dokumen konsep sudah
 * memutuskan ini). Folder tujuan DI DALAM repo dipilih dari daftar
 * (listTopLevelDirs, padanan pick_folder_in_repo CLI), bukan ketik path.
 *
 * Yang SENGAJA beda dari CLI (dicatat biar jelas, bukan kelewat):
 *  - Auto-backup sebelum overwrite (upload.py manggil backup_module) -
 *    BELUM ADA karena Backup sendiri baru Fase 7. User diberi warning
 *    eksplisit soal ini sebelum konfirmasi overwrite.
 *  - "Langkah berikutnya: Git Add + Commit" - CLI bisa langsung arahkan
 *    kesitu, app ini belum bisa karena Fase 3 belum dibangun. Disebutkan
 *    di ringkasan akhir sebagai catatan, bukan tombol aktif.
 *  - ZIP Analyzer tree CLI (rich.Tree bertingkat) disederhanakan jadi
 *    daftar rata 1 level (previewChildren di uploadRepo.js) - layar HP
 *    kecil, logic deteksi/diff-nya tetap port persis.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Button, Card, SectionTitle, InfoBanner, PillRow, StatusTable, ErrorBanner } from '../components/UI';
import { COLORS, SPACING } from '../theme';
import { REPOS_ROOT } from '../git/fsAdapter';
import {
  loadZip,
  zipEntryNames,
  countZipItems,
  previewChildren,
  computeZipDiff,
  extractZip,
  copyFileToRepoFolder,
  countFilesInDir,
  listTopLevelDirs,
} from '../git/uploadRepo';
import { detectZipRoot } from '../git/zipCore';
import { logActivity, logError } from '../logging/logger';
import { formatSize } from '../utils/format';

function repoRealDir(repo) {
  return `${REPOS_ROOT}${String(repo.dir).replace(/^\/+/, '')}`;
}

export default function UploadScreen({ repo, onBack }) {
  const [mode, setMode] = useState('menu'); // menu | destPick | zipStats | zipDiff | extracting | summary | error
  const [flow, setFlow] = useState(null); // 'file' | 'zipExtract' | 'zipNoExtract'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // state antar-langkah
  const [sourceUri, setSourceUri] = useState(null);
  const [sourceName, setSourceName] = useState(null);
  const [zip, setZip] = useState(null);
  const [entryNames, setEntryNames] = useState([]);
  const [rootPrefix, setRootPrefix] = useState(null); // null = belum ditentukan, '' = 0 wrapper
  const [ambiguous, setAmbiguous] = useState(null); // { ambiguous, candidates } | null
  const [destSubdirs, setDestSubdirs] = useState([]);
  const [destFolder, setDestFolder] = useState(''); // relatif ('' = root repo)
  const [manualDest, setManualDest] = useState('');
  const [diff, setDiff] = useState(null);
  const [overwrite, setOverwrite] = useState(true);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [zipSizeBytes, setZipSizeBytes] = useState(0);

  const reset = () => {
    setMode('menu');
    setFlow(null);
    setError('');
    setSourceUri(null);
    setSourceName(null);
    setZip(null);
    setEntryNames([]);
    setRootPrefix(null);
    setAmbiguous(null);
    setDestFolder('');
    setManualDest('');
    setDiff(null);
    setProgress(null);
    setSummary(null);
    setZipSizeBytes(0);
  };

  const startPickDest = async () => {
    setBusy(true);
    const subdirs = await listTopLevelDirs(repoRealDir(repo)).catch(() => []);
    setDestSubdirs(subdirs);
    setBusy(false);
    setMode('destPick');
  };

  // ---------------- Upload File ----------------
  const handleUploadFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setSourceUri(asset.uri);
    setSourceName(asset.name);
    setFlow('file');
    await startPickDest();
  };

  // ---------------- Upload ZIP (No Extract) ----------------
  const handleUploadZipNoExtract = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.name?.toLowerCase().endsWith('.zip')) {
      Alert.alert('Bukan file ZIP', 'Pilih file dengan ekstensi .zip.');
      return;
    }
    setSourceUri(asset.uri);
    setSourceName(asset.name);
    setFlow('zipNoExtract');
    await startPickDest();
  };

  // ---------------- Upload ZIP (Extract) ----------------
  const handleUploadZipExtract = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.name?.toLowerCase().endsWith('.zip')) {
      Alert.alert('Bukan file ZIP', 'Pilih file dengan ekstensi .zip.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const z = await loadZip(asset.uri);
      const names = zipEntryNames(z);
      setZip(z);
      setEntryNames(names);
      setSourceUri(asset.uri);
      setSourceName(asset.name);
      setFlow('zipExtract');
      const info = await FileSystem.getInfoAsync(asset.uri).catch(() => null);
      setZipSizeBytes(info?.size || asset.size || 0);

      const detected = detectZipRoot(names);
      if (detected.ambiguous !== undefined) {
        setAmbiguous(detected);
        setMode('chooseRoot');
      } else {
        setRootPrefix(detected.prefix);
        setMode('zipStats');
      }
    } catch (e) {
      await logError('ZIP rusak saat analisis', e?.message);
      setError('File ZIP rusak atau tidak valid.');
      setMode('error');
    } finally {
      setBusy(false);
    }
  };

  const chooseRootCandidate = (candidate) => {
    const prefix = candidate === null ? ambiguous.ambiguous : ambiguous.ambiguous + candidate + '/';
    setRootPrefix(prefix);
    setAmbiguous(null);
    setMode('zipStats');
  };

  // ---------------- Finalisasi Upload File / ZIP No-Extract ----------------
  const confirmDest = async (destValue) => {
    const finalDest = destValue.replace(/^\/+/, '');
    setDestFolder(finalDest);
    if (flow === 'zipExtract') {
      await proceedToDiffWith(finalDest);
    } else {
      await finalizeSimpleCopyWith(finalDest);
    }
  };

  const proceedToDiffWith = async (dest) => {
    setBusy(true);
    const destUri = dest ? `${repoRealDir(repo)}/${dest.replace(/\/+$/, '')}` : repoRealDir(repo);
    const d = await computeZipDiff(zip, entryNames, destUri, rootPrefix);
    setDiff(d);
    setBusy(false);
    setMode('zipDiff');
  };

  const finalizeSimpleCopyWith = async (dest) => {
    setBusy(true);
    const destUri = dest ? `${repoRealDir(repo)}/${dest.replace(/\/+$/, '')}` : repoRealDir(repo);
    const filesBefore = await countFilesInDir(repoRealDir(repo));
    try {
      await copyFileToRepoFolder(sourceUri, destUri, sourceName);
      const filesAfter = await countFilesInDir(repoRealDir(repo));
      setSummary({ added: filesAfter - filesBefore, modified: 0, filesBefore, filesAfter });
      await logActivity(`${flow === 'file' ? 'Upload File' : 'Upload ZIP (No Extract)'} berhasil ke ${repo.fullName}`);
      setMode('summary');
    } catch (e) {
      await logError(`Gagal ${flow === 'file' ? 'upload file' : 'upload ZIP (no extract)'}`, e?.message);
      setError('Gagal menyalin file ke repository.');
      setMode('error');
    } finally {
      setBusy(false);
    }
  };

  const runExtract = async () => {
    setMode('extracting');
    setProgress({ done: 0, total: diff.totalEntries });
    const destUri = destFolder ? `${repoRealDir(repo)}/${destFolder.replace(/\/+$/, '')}` : repoRealDir(repo);
    const filesBefore = await countFilesInDir(repoRealDir(repo));
    try {
      await extractZip(zip, entryNames, destUri, rootPrefix, overwrite, (done, total) => setProgress({ done, total }));
      const filesAfter = await countFilesInDir(repoRealDir(repo));
      setSummary({
        added: diff.tambah,
        modified: diff.update,
        filesBefore,
        filesAfter,
      });
      await logActivity(`Upload ZIP (Extract) berhasil ke ${repo.fullName}`);
      setMode('summary');
    } catch (e) {
      await logError('Gagal ekstrak ZIP', e?.message);
      setError('Gagal mengekstrak ZIP. Sebagian file mungkin sudah tertulis.');
      setMode('error');
    }
  };

  // ---------------- Render tiap mode ----------------

  if (busy) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (mode === 'menu') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Upload - {repo.fullName}</SectionTitle>
        <InfoBanner>File belum otomatis ter-commit setelah upload. Pakai menu "Git Add & Commit" sesudahnya (Fase 3).</InfoBanner>
        <PillRow icon="file" label="Upload File" sublabel="Salin satu file ke repository" onPress={handleUploadFile} />
        <PillRow icon="upload" label="Upload ZIP (Extract)" sublabel="Ekstrak isi ZIP, deteksi folder wrapper, preview perubahan" onPress={handleUploadZipExtract} />
        <PillRow icon="package" label="Upload ZIP (No Extract)" sublabel="Salin file ZIP apa adanya, tanpa dibongkar" onPress={handleUploadZipNoExtract} />
        <Button title="Tutup" variant="secondary" onPress={onBack} />
      </ScrollView>
    );
  }

  if (mode === 'chooseRoot') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Root Project Tidak Bisa Ditentukan Otomatis</SectionTitle>
        <InfoBanner>
          Ada lebih dari satu folder sejajar di level ini tanpa penanda project yang jelas. Pilih folder mana
          yang jadi root project (isi ZIP yang sebenarnya).
        </InfoBanner>
        {ambiguous.candidates.map((c) => (
          <PillRow key={c} icon="folder" label={c} onPress={() => chooseRootCandidate(c)} />
        ))}
        <PillRow
          icon="folder-minus"
          label={`0 Wrapper - pakai "${ambiguous.ambiguous || '(root ZIP)'}" apa adanya`}
          onPress={() => chooseRootCandidate(null)}
        />
        <Button title="Batal" variant="secondary" onPress={reset} />
      </ScrollView>
    );
  }

  if (mode === 'zipStats') {
    const stats = countZipItems(entryNames);
    const chain = rootPrefix ? rootPrefix.split('/').filter(Boolean) : [];
    const preview = previewChildren(entryNames, rootPrefix || '');
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>ZIP Analyzer</SectionTitle>
        <Card>
          <StatusTable
            rows={[
              { label: 'Jumlah wrapper', value: String(chain.length) },
              { label: 'Root project', value: rootPrefix || '(langsung dari root ZIP)' },
              { label: 'Jumlah folder', value: String(stats.dirs) },
              { label: 'Jumlah file', value: String(stats.files) },
              { label: 'Ukuran ZIP', value: formatSize(zipSizeBytes / 1024) },
            ]}
          />
        </Card>

        <SectionTitle>Upload Preview (isi root project)</SectionTitle>
        <Card>
          {preview.items.map((it) => (
            <Text key={it.name} style={styles.previewLine}>
              {it.isDir ? `${it.name}/` : it.name}
            </Text>
          ))}
          {preview.remaining > 0 ? <Text style={styles.previewMore}>... dan {preview.remaining} item lainnya</Text> : null}
        </Card>

        <Button title="Lanjutkan" onPress={startPickDest} />
        <Button title="Batal" variant="secondary" onPress={reset} />
      </ScrollView>
    );
  }

  if (mode === 'destPick') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Pilih Folder Tujuan di Repository</SectionTitle>
        <PillRow icon="folder" label="/ (root repository)" onPress={() => confirmDest('')} />
        {destSubdirs.map((d) => (
          <PillRow key={d} icon="folder" label={d} onPress={() => confirmDest(d)} />
        ))}
        <SectionTitle style={{ marginTop: SPACING.md }}>Atau ketik sub-folder baru</SectionTitle>
        <TextInput
          style={styles.input}
          placeholder="mis. assets/gambar"
          placeholderTextColor={COLORS.inkFaint}
          value={manualDest}
          onChangeText={setManualDest}
        />
        <Button title="Pakai Folder Ini" onPress={() => confirmDest(manualDest.trim())} disabled={!manualDest.trim()} />
        <Button title="Batal" variant="secondary" onPress={reset} />
      </ScrollView>
    );
  }

  if (mode === 'zipDiff') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Analisis Perubahan</SectionTitle>
        <Card>
          <StatusTable
            rows={[
              { label: 'Repository', value: repo.fullName },
              { label: 'Tujuan', value: destFolder ? `/${destFolder}` : '/ (root)' },
              { label: 'Total file diproses', value: String(diff.totalEntries) },
              { label: 'Sama (tidak berubah)', value: String(diff.sama) },
              { label: 'Update', value: String(diff.update) },
              { label: 'File baru', value: String(diff.tambah) },
              { label: 'Akan dihapus (info saja)', value: String(diff.delete) },
            ]}
          />
        </Card>
        <InfoBanner>
          "Akan dihapus" cuma informasi - ekstraksi TIDAK menghapus file lokal secara otomatis. Backup otomatis
          sebelum overwrite belum tersedia (Fase 7) - pastikan repo sudah di-push dulu kalau ada perubahan
          penting yang belum tersimpan.
        </InfoBanner>
        <PillRow
          icon={overwrite ? 'toggle-right' : 'toggle-left'}
          label={overwrite ? 'Timpa file yang bentrok: Ya' : 'Timpa file yang bentrok: Tidak'}
          sublabel="Tap untuk ganti"
          onPress={() => setOverwrite((v) => !v)}
        />
        <Button title="Lanjutkan Ekstrak" onPress={runExtract} />
        <Button title="Batal" variant="secondary" onPress={reset} />
      </ScrollView>
    );
  }

  if (mode === 'extracting') {
    const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} />
        <Text style={styles.progressText}>Mengekstrak... {progress?.done || 0}/{progress?.total || 0} ({pct}%)</Text>
      </View>
    );
  }

  if (mode === 'summary') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Ringkasan Setelah Upload</SectionTitle>
        <Card>
          <StatusTable
            rows={[
              { label: 'Repository', value: repo.fullName },
              { label: 'Branch', value: repo.defaultBranch },
              { label: 'Jumlah file baru/disalin', value: String(summary.added) },
              { label: 'Jumlah file berubah', value: String(summary.modified) },
              { label: 'Total file sebelum', value: String(summary.filesBefore) },
              { label: 'Total file sesudah', value: String(summary.filesAfter) },
            ]}
          />
        </Card>
        <InfoBanner>Langkah berikutnya: pakai menu "Git Add & Commit" buat menyimpan perubahan ini (Fase 3, belum dibangun).</InfoBanner>
        <Button title="Upload Lagi" variant="secondary" onPress={reset} />
        <Button title="Selesai" onPress={onBack} />
      </ScrollView>
    );
  }

  if (mode === 'error') {
    return (
      <View style={styles.container}>
        <ErrorBanner message={error} />
        <Button title="Coba Lagi" variant="secondary" onPress={reset} />
        <Button title="Tutup" onPress={onBack} />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  previewLine: { fontSize: 13, color: COLORS.ink, paddingVertical: 2 },
  previewMore: { fontSize: 12, color: COLORS.inkFaint, marginTop: 4 },
  progressText: { fontSize: 13, color: COLORS.ink, marginTop: SPACING.md, textAlign: 'center' },
});
