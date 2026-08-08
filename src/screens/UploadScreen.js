/**
 * UploadScreen.js
 * Padanan menu Upload CLI asli (upload.py, modul terbesar - 805 baris).
 * 3 dari 4 aksi CLI diimplementasi: Upload File, Upload ZIP (Extract),
 * Upload ZIP (No Extract). "Upload Folder" SENGAJA belum - dokumen konsep
 * sendiri (Bagian 4.7) sudah menandai ini sebagai "dievaluasi ketersediaan
 * API OS" - bukan kelupaan, memang nunggu keputusan terpisah.
 *
 * BUGFIX (7 Agustus 2026, laporan Zen): deteksi wrapper ZIP (algoritma
 * warisan CLI asli) salah tebak kalau ZIP isinya cuma 1 file di jalur
 * nested (mis. app/api/siswa/route.js) - dianggap wrapper, padahal itu
 * struktur folder yang memang diinginkan. Fix (lihat refineDetectedPrefix
 * di uploadRepo.js):
 *   1. Folder tujuan sekarang dipilih SEBELUM deteksi root (bukan
 *      sesudah), supaya bisa dicek "path ini udah ada di repo?" - kalau
 *      sudah ada, jangan di-strip.
 *   2. Fallback: hasil setelah strip cuma 1 file sendirian -> jangan
 *      di-strip juga.
 *   3. TETAP ada tombol override manual di layar ZIP Analyzer - dua
 *      pengaman di atas gak 100% akurat (lihat komentar refineDetectedPrefix),
 *      keputusan akhir harus bisa dikoreksi user.
 *
 * Yang SENGAJA beda dari CLI lainnya:
 *  - Auto-backup sebelum overwrite - BELUM ADA (Backup = Fase 7). Warning
 *    eksplisit ditampilkan sebelum konfirmasi overwrite.
 *  - ZIP Analyzer tree CLI (rich.Tree bertingkat) disederhanakan jadi
 *    daftar rata 1 level (previewChildren) - layar HP kecil.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Button, Card, SectionTitle, InfoBanner, SuccessBanner, PillRow, StatusTable, ErrorBanner } from '../components/UI';
import { LoadingModal, appAlert } from '../components/AppModals';
import { useBackHandler } from '../hooks/useBackHandler';
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
  refineDetectedPrefix,
} from '../git/uploadRepo';
import { detectZipRoot } from '../git/zipCore';
import { invalidateStatusCache } from '../git/statusCache';
import { logActivity, logError } from '../logging/logger';
import { formatSize } from '../utils/format';

function repoRealDir(repo) {
  return `${REPOS_ROOT}${String(repo.dir).replace(/^\/+/, '')}`;
}

export default function UploadScreen({ repo, onBack }) {
  const [mode, setMode] = useState('menu');
  const [flow, setFlow] = useState(null); // 'file' | 'zipExtract' | 'zipNoExtract'
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Memproses...');
  const [error, setError] = useState('');

  const [sourceUri, setSourceUri] = useState(null);
  const [sourceName, setSourceName] = useState(null);
  const [zip, setZip] = useState(null);
  const [entryNames, setEntryNames] = useState([]);
  const [rootPrefix, setRootPrefix] = useState(null); // null = belum ditentukan, '' = 0 wrapper
  const [detectedPrefixRaw, setDetectedPrefixRaw] = useState(null); // hasil deteksi mentah, buat tombol "pakai deteksi lagi"
  const [ambiguous, setAmbiguous] = useState(null);
  const [destSubdirs, setDestSubdirs] = useState([]);
  const [destFolder, setDestFolder] = useState('');
  const [manualDest, setManualDest] = useState('');
  const [diff, setDiff] = useState(null);
  const [showDeleteDetail, setShowDeleteDetail] = useState(false);
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
    setDetectedPrefixRaw(null);
    setAmbiguous(null);
    setDestFolder('');
    setManualDest('');
    setDiff(null);
    setShowDeleteDetail(false);
    setProgress(null);
    setSummary(null);
    setZipSizeBytes(0);
  };

  // Back Android: keluar dari mode manapun yang lagi jalan balik ke menu
  // utama Upload dulu (bukan sekaligus keluar overlay & balik ke tab) -
  // sesuai laporan Zen. Belum step-by-step penuh (chooseRoot -> zipStats
  // -> dst satu-satu), tapi udah nyelamatin dari "back = keluar app".
  useBackHandler(() => {
    if (mode !== 'menu') { reset(); return true; }
    return false;
  }, [mode]);

  const destUriFor = (dest) => (dest ? `${repoRealDir(repo)}/${dest.replace(/\/+$/, '')}` : repoRealDir(repo));

  const startPickDest = async () => {
    setBusy(true);
    setBusyLabel('Memuat daftar folder...');
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
      appAlert('Bukan file ZIP', 'Pilih file dengan ekstensi .zip.');
      return;
    }
    setSourceUri(asset.uri);
    setSourceName(asset.name);
    setFlow('zipNoExtract');
    await startPickDest();
  };

  // ---------------- Upload ZIP (Extract) ----------------
  // BUGFIX: dest sekarang dipilih DULUAN, baru root di-detect - lihat
  // catatan panjang di atas kenapa urutannya dibalik.
  const handleUploadZipExtract = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.name?.toLowerCase().endsWith('.zip')) {
      appAlert('Bukan file ZIP', 'Pilih file dengan ekstensi .zip.');
      return;
    }
    setBusy(true);
    setBusyLabel('Membaca isi ZIP...');
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

      const subdirs = await listTopLevelDirs(repoRealDir(repo)).catch(() => []);
      setDestSubdirs(subdirs);
      setBusy(false);
      setMode('destPickForZip');
    } catch (e) {
      await logError('ZIP rusak saat analisis', e?.message);
      setError('File ZIP rusak atau tidak valid.');
      setBusy(false);
      setMode('error');
    }
  };

  const runDetection = async (dest, names) => {
    const destUri = destUriFor(dest);
    const detected = detectZipRoot(names);
    if (detected.ambiguous !== undefined) {
      setAmbiguous(detected);
      setMode('chooseRoot');
      return;
    }
    const refined = await refineDetectedPrefix(detected.prefix, names, destUri);
    setDetectedPrefixRaw(detected.prefix);
    setRootPrefix(refined);
    setMode('zipStats');
  };

  const confirmDestForZipExtract = async (destValue) => {
    const finalDest = destValue.replace(/^\/+/, '');
    setDestFolder(finalDest);
    setBusy(true);
    setBusyLabel('Menganalisis struktur ZIP...');
    await runDetection(finalDest, entryNames);
    setBusy(false);
  };

  const chooseRootCandidate = async (candidate) => {
    const prefix = candidate === null ? ambiguous.ambiguous : ambiguous.ambiguous + candidate + '/';
    setBusy(true);
    setBusyLabel('Menganalisis struktur ZIP...');
    const destUri = destUriFor(destFolder);
    const refined = await refineDetectedPrefix(prefix, entryNames, destUri);
    setDetectedPrefixRaw(prefix);
    setRootPrefix(refined);
    setBusy(false);
    // BUGFIX (7 Agustus 2026): mode WAJIB diganti duluan sebelum ambiguous
    // di-null-in - RN (arsitektur lama) gak selalu nge-batch setState
    // setelah await, jadi kalau urutannya kebalik ada celah render
    // ambiguous=null TAPI mode masih 'chooseRoot' -> crash
    // "Cannot read property 'candidates' of null".
    setMode('zipStats');
    setAmbiguous(null);
  };

  const toggleWrapperOverride = () => {
    setRootPrefix((current) => (current ? '' : detectedPrefixRaw || ''));
  };

  // ---------------- Finalisasi Upload File / ZIP No-Extract ----------------
  const confirmDest = async (destValue) => {
    const finalDest = destValue.replace(/^\/+/, '');
    setDestFolder(finalDest);
    await finalizeSimpleCopyWith(finalDest);
  };

  const proceedToDiff = async () => {
    setBusy(true);
    setBusyLabel('Menghitung perubahan...');
    const destUri = destUriFor(destFolder);
    const d = await computeZipDiff(zip, entryNames, destUri, rootPrefix);
    setDiff(d);
    setShowDeleteDetail(false);
    setBusy(false);
    setMode('zipDiff');
  };

  const finalizeSimpleCopyWith = async (dest) => {
    setBusy(true);
    setBusyLabel('Menyalin file...');
    const destUri = destUriFor(dest);
    // BUGFIX (laporan Zen): dulu `added` dihitung dari selisih JUMLAH file
    // total sebelum/sesudah (filesAfter - filesBefore) - itu selalu 0
    // kalau file yang di-upload NIMPA file yang udah ada (jumlah total
    // gak berubah, isinya doang yang beda), dan `modified` malah di-hardcode
    // 0 terus, gak pernah dicek beneran. Sekarang dicek langsung: apakah
    // file di path tujuan itu sudah ada SEBELUM disalin.
    const targetUri = `${destUri.replace(/\/+$/, '')}/${sourceName}`;
    const existedBefore = (await FileSystem.getInfoAsync(targetUri).catch(() => ({ exists: false }))).exists;
    const filesBefore = await countFilesInDir(repoRealDir(repo));
    try {
      await copyFileToRepoFolder(sourceUri, destUri, sourceName);
      invalidateStatusCache(repo.dir);
      const filesAfter = await countFilesInDir(repoRealDir(repo));
      setSummary({ added: existedBefore ? 0 : 1, modified: existedBefore ? 1 : 0, filesBefore, filesAfter });
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
    const destUri = destUriFor(destFolder);
    const filesBefore = await countFilesInDir(repoRealDir(repo));
    try {
      await extractZip(zip, entryNames, destUri, rootPrefix, overwrite, (done, total) => setProgress({ done, total }));
      invalidateStatusCache(repo.dir);
      const filesAfter = await countFilesInDir(repoRealDir(repo));
      setSummary({ added: diff.tambah, modified: diff.update, filesBefore, filesAfter });
      await logActivity(`Upload ZIP (Extract) berhasil ke ${repo.fullName}`);
      setMode('summary');
    } catch (e) {
      await logError('Gagal ekstrak ZIP', e?.message);
      setError('Gagal mengekstrak ZIP. Sebagian file mungkin sudah tertulis.');
      setMode('error');
    }
  };

  // ---------------- Render tiap mode ----------------
  let content = null;

  if (mode === 'menu') {
    content = (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Upload - {repo.fullName}</SectionTitle>
        <InfoBanner>File belum otomatis ter-commit setelah upload. Pakai menu "Git Add & Commit" sesudahnya.</InfoBanner>
        <PillRow icon="file" label="Upload File" sublabel="Salin satu file ke repository" onPress={handleUploadFile} disabled={busy} />
        <PillRow icon="upload" label="Upload ZIP (Extract)" sublabel="Ekstrak isi ZIP, deteksi folder wrapper, preview perubahan" onPress={handleUploadZipExtract} disabled={busy} />
        <PillRow icon="package" label="Upload ZIP (No Extract)" sublabel="Salin file ZIP apa adanya, tanpa dibongkar" onPress={handleUploadZipNoExtract} disabled={busy} />
        <Button title="Tutup" variant="secondary" onPress={onBack} />
      </ScrollView>
    );
  } else if (mode === 'destPickForZip') {
    // Sama seperti destPick, tapi lanjut ke deteksi root (bukan langsung diff).
    content = (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Pilih Folder Tujuan di Repository</SectionTitle>
        <InfoBanner>Dipilih duluan sebelum deteksi struktur ZIP, supaya deteksi bisa lebih akurat.</InfoBanner>
        <PillRow icon="folder" label="/ (root repository)" onPress={() => confirmDestForZipExtract('')} disabled={busy} />
        {destSubdirs.map((d) => (
          <PillRow key={d} icon="folder" label={d} onPress={() => confirmDestForZipExtract(d)} disabled={busy} />
        ))}
        <SectionTitle style={{ marginTop: SPACING.md }}>Atau ketik sub-folder baru</SectionTitle>
        <TextInput
          style={styles.input}
          placeholder="mis. assets/gambar"
          placeholderTextColor={COLORS.inkFaint}
          value={manualDest}
          onChangeText={setManualDest}
        />
        <Button title="Pakai Folder Ini" onPress={() => confirmDestForZipExtract(manualDest.trim())} disabled={!manualDest.trim()} />
        <Button title="Batal" variant="secondary" onPress={reset} />
      </ScrollView>
    );
  } else if (mode === 'chooseRoot' && ambiguous) {
    content = (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Root Project Tidak Bisa Ditentukan Otomatis</SectionTitle>
        <InfoBanner>
          Ada lebih dari satu folder sejajar di level ini tanpa penanda project yang jelas. Pilih folder mana
          yang jadi root project (isi ZIP yang sebenarnya).
        </InfoBanner>
        {ambiguous.candidates.map((c) => (
          <PillRow key={c} icon="folder" label={c} onPress={() => chooseRootCandidate(c)} disabled={busy} />
        ))}
        <PillRow
          icon="folder-minus"
          label={`0 Wrapper - pakai "${ambiguous.ambiguous || '(root ZIP)'}" apa adanya`}
          onPress={() => chooseRootCandidate(null)}
        />
        <Button title="Batal" variant="secondary" onPress={reset} />
      </ScrollView>
    );
  } else if (mode === 'zipStats') {
    const stats = countZipItems(entryNames);
    const chain = rootPrefix ? rootPrefix.split('/').filter(Boolean) : [];
    const preview = previewChildren(entryNames, rootPrefix || '');
    const wasAutoStripped = !!detectedPrefixRaw && rootPrefix === '' && detectedPrefixRaw !== '';
    content = (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>ZIP Analyzer</SectionTitle>
        {wasAutoStripped ? (
          <InfoBanner>
            Struktur "{detectedPrefixRaw}" kelihatan seperti folder pembungkus, tapi sudah dicek dan ternyata
            memang bagian dari isi project (bukan wrapper) - jadi TIDAK di-strip.
          </InfoBanner>
        ) : null}
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

        {detectedPrefixRaw ? (
          <PillRow
            icon={rootPrefix ? 'toggle-right' : 'toggle-left'}
            tone={rootPrefix ? 'accent' : 'success'}
            label={rootPrefix ? `Strip wrapper "${detectedPrefixRaw}"` : 'Pakai struktur ZIP asli (tanpa strip)'}
            sublabel="Salah tebak? Tap buat ganti manual"
            onPress={toggleWrapperOverride}
          />
        ) : null}

        <SectionTitle>Upload Preview (isi root project)</SectionTitle>
        <Card>
          {preview.items.map((path) => (
            <Text key={path} style={styles.previewLine}>{path}</Text>
          ))}
          {preview.remaining > 0 ? <Text style={styles.previewMore}>... dan {preview.remaining} file lainnya</Text> : null}
        </Card>

        <Button title="Lanjutkan" onPress={proceedToDiff} />
        <Button title="Batal" variant="secondary" onPress={reset} />
      </ScrollView>
    );
  } else if (mode === 'destPick') {
    content = (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <SectionTitle>Pilih Folder Tujuan di Repository</SectionTitle>
        <PillRow icon="folder" label="/ (root repository)" onPress={() => confirmDest('')} disabled={busy} />
        {destSubdirs.map((d) => (
          <PillRow key={d} icon="folder" label={d} onPress={() => confirmDest(d)} disabled={busy} />
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
  } else if (mode === 'zipDiff') {
    content = (
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
          "Akan dihapus" = file yang ADA di folder tujuan lokal tapi TIDAK ADA di ZIP ini (bisa termasuk
          node_modules dkk kalau kebetulan ada di lokal tapi gak disertakan di ZIP). Cuma informasi -
          ekstraksi TIDAK menghapus apa pun otomatis. Backup otomatis sebelum overwrite belum tersedia (Fase 7).
        </InfoBanner>
        {diff.delete > 0 ? (
          <>
            <Button
              title={showDeleteDetail ? 'Sembunyikan Detail' : `Lihat Detail (${diff.deleteSamples.length}${diff.delete > diff.deleteSamples.length ? '+' : ''})`}
              variant="secondary"
              onPress={() => setShowDeleteDetail((v) => !v)}
            />
            {showDeleteDetail ? (
              <Card>
                {diff.deleteSamples.map((p) => (
                  <Text key={p} style={styles.previewLine}>{p}</Text>
                ))}
                {diff.delete > diff.deleteSamples.length ? (
                  <Text style={styles.previewMore}>... dan {diff.delete - diff.deleteSamples.length} file lainnya</Text>
                ) : null}
              </Card>
            ) : null}
          </>
        ) : null}
        <PillRow
          icon={overwrite ? 'toggle-right' : 'toggle-left'}
          tone={overwrite ? 'success' : 'warning'}
          label={overwrite ? 'Timpa file lama: Ya' : 'Timpa file lama: Tidak'}
          sublabel="Tap untuk ganti"
          onPress={() => setOverwrite((v) => !v)}
        />
        <Button title="Lanjutkan Ekstrak" onPress={runExtract} />
        <Button title="Batal" variant="secondary" onPress={reset} />
      </ScrollView>
    );
  } else if (mode === 'extracting') {
    const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    content = (
      <View style={styles.center}>
        <Text style={styles.progressText}>Mengekstrak... {progress?.done || 0}/{progress?.total || 0} ({pct}%)</Text>
      </View>
    );
  } else if (mode === 'summary') {
    content = (
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
        <SuccessBanner>Langkah berikutnya: pakai menu "Git Add & Commit" buat menyimpan perubahan ini.</SuccessBanner>
        <Button title="Upload Lagi" variant="secondary" onPress={reset} />
        <Button title="Selesai" onPress={onBack} />
      </ScrollView>
    );
  } else if (mode === 'error') {
    content = (
      <View style={styles.container}>
        <ErrorBanner message={error} />
        <Button title="Coba Lagi" variant="secondary" onPress={reset} />
        <Button title="Tutup" onPress={onBack} />
      </View>
    );
  }

  return (
    <>
      {content}
      <LoadingModal visible={busy} label={busyLabel} icon="upload" />
    </>
  );
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
