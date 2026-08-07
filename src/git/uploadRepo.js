/**
 * uploadRepo.js
 * Bagian upload.py CLI asli yang nyentuh filesystem beneran - baca ZIP,
 * hitung diff, ekstrak, copy file/ZIP apa adanya, list folder tujuan di
 * dalam repo. Logic murni (deteksi root, Zip Slip) ada di zipCore.js,
 * modul ini yang manggilnya + kerjain I/O sungguhan.
 *
 * Pengganti library Python:
 *   zipfile      -> jszip (baca isi ZIP di JS, pure JS - tanpa dependency
 *                    native, gak perlu prebuild ulang)
 *   hashlib.sha1 -> expo-crypto Crypto.digest() (SUDAH jadi dependency
 *                    sejak Fase 0, binary-safe lewat Uint8Array - bukan
 *                    digestStringAsync yang cuma aman buat teks UTF8)
 */

import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { safeZipMemberPath } from './zipCore';
import { mkdirRecursive } from './fsAdapter';

function bufToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha1OfBytes(uint8) {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA1, uint8);
  return bufToHex(digest);
}

async function sha1OfFile(uri) {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return await sha1OfBytes(Buffer.from(base64, 'base64'));
  } catch {
    return null;
  }
}

/** Muat ZIP dari URI (hasil document picker) jadi instance JSZip. Lempar
 * error kalau file rusak/bukan ZIP valid - persis zipfile.BadZipFile CLI. */
export async function loadZip(zipUri) {
  const base64 = await FileSystem.readAsStringAsync(zipUri, { encoding: FileSystem.EncodingType.Base64 });
  return JSZip.loadAsync(base64, { base64: true });
}

export function zipEntryNames(zip) {
  return Object.keys(zip.files);
}

/** Statistik ZIP - padanan _count_zip_items() CLI (jumlah file & folder
 * unik dari seluruh isi ZIP, bukan cuma yang di bawah root terpilih). */
export function countZipItems(entryNames) {
  let files = 0;
  const dirs = new Set();
  for (const name of entryNames) {
    if (name.endsWith('/')) {
      const trimmed = name.replace(/\/+$/, '');
      if (trimmed) dirs.add(trimmed);
      continue;
    }
    files += 1;
    const parts = name.split('/').slice(0, -1);
    const acc = [];
    for (const p of parts) {
      if (!p) continue;
      acc.push(p);
      dirs.add(acc.join('/'));
    }
  }
  return { files, dirs: dirs.size };
}

/** Item satu level langsung di bawah rootPrefix - buat "Upload Preview"
 * (versi disederhanakan dari rich.Tree CLI: daftar rata, dibatasi jumlah
 * item yang ditampilkan, bukan tree bertingkat penuh - layar HP kecil). */
export function previewChildren(entryNames, rootPrefix, limit = 25) {
  const dirs = new Set();
  const files = [];
  const plen = rootPrefix.length;
  for (const name of entryNames) {
    if (rootPrefix && !name.startsWith(rootPrefix)) continue;
    const rel = name.slice(plen);
    if (!rel) continue;
    const parts = rel.split('/');
    if (parts.length > 1) {
      if (parts[0]) dirs.add(parts[0]);
    } else if (!rel.endsWith('/') && parts[0]) {
      files.push(parts[0]);
    }
  }
  const items = [...[...dirs].sort().map((d) => ({ name: d, isDir: true })), ...files.sort().map((f) => ({ name: f, isDir: false }))];
  return { items: items.slice(0, limit), remaining: Math.max(0, items.length - limit) };
}

/**
 * Hitung Tambah/Update/Sama/Delete kalau ZIP ini diekstrak ke destDirUri -
 * padanan _compute_zip_diff() CLI. Cuma proses file di bawah rootPrefix.
 */
export async function computeZipDiff(zip, entryNames, destDirUri, rootPrefix) {
  let tambah = 0;
  let update = 0;
  let sama = 0;
  const targetSet = new Set();

  for (const name of entryNames) {
    if (name.endsWith('/')) continue;
    if (rootPrefix && !name.startsWith(rootPrefix)) continue;
    const rel = rootPrefix ? name.slice(rootPrefix.length) : name;
    if (!rel) continue;

    const targetUri = safeZipMemberPath(destDirUri, rel);
    if (!targetUri) continue; // Zip Slip - entry ditolak, gak dihitung sebagai perubahan
    targetSet.add(targetUri);

    const info = await FileSystem.getInfoAsync(targetUri).catch(() => ({ exists: false }));
    if (!info.exists) {
      tambah += 1;
      continue;
    }
    const localHash = await sha1OfFile(targetUri);
    const zipBytes = await zip.files[name].async('uint8array');
    const zipHash = await sha1OfBytes(zipBytes);
    if (localHash !== zipHash) update += 1;
    else sama += 1;
  }

  const deleteSamples = [];
  const delCount = await countFilesNotInTargetSet(destDirUri, targetSet, deleteSamples, 30);
  // Path relatif ke destDirUri - lebih enak dibaca user daripada URI absolut.
  const deleteSamplesRel = deleteSamples.map((uri) => uri.slice(destDirUri.replace(/\/+$/, '').length + 1));
  return { tambah, update, sama, delete: delCount, deleteSamples: deleteSamplesRel, targetSet, totalEntries: targetSet.size };
}

async function countFilesNotInTargetSet(rootUri, targetSet, samples, sampleLimit) {
  let count = 0;
  let entries;
  try {
    entries = await FileSystem.readDirectoryAsync(rootUri);
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (name === '.git' || name.startsWith('.')) continue; // konsisten sama count_files_in_dir() CLI
    const childUri = `${rootUri.replace(/\/+$/, '')}/${name}`;
    const info = await FileSystem.getInfoAsync(childUri).catch(() => null);
    if (!info || !info.exists) continue;
    if (info.isDirectory) {
      count += await countFilesNotInTargetSet(childUri, targetSet, samples, sampleLimit);
    } else if (!targetSet.has(childUri)) {
      count += 1;
      // Simpan path RELATIF ke rootUri asal (destDirUri), bukan childUri
      // absolut, biar enak dibaca user - lihat pemanggil (computeZipDiff)
      // yang nyimpen destDirUri buat hitung relatifnya balik.
      if (samples.length < sampleLimit) samples.push(childUri);
    }
  }
  return count;
}

/** Jumlah file (bukan folder) di dalam path, rekursif, exclude .git &
 * hidden - padanan count_files_in_dir() CLI. */
export async function countFilesInDir(rootUri) {
  let total = 0;
  let entries;
  try {
    entries = await FileSystem.readDirectoryAsync(rootUri);
  } catch {
    return 0;
  }
  for (const name of entries) {
    if (name === '.git' || name.startsWith('.')) continue;
    const childUri = `${rootUri.replace(/\/+$/, '')}/${name}`;
    const info = await FileSystem.getInfoAsync(childUri).catch(() => null);
    if (!info || !info.exists) continue;
    if (info.isDirectory) total += await countFilesInDir(childUri);
    else total += 1;
  }
  return total;
}

/**
 * Ekstrak ZIP sungguhan ke destDirUri - padanan loop ekstraksi di
 * upload_zip_extract() CLI, termasuk Zip Slip protection & skip file
 * bentrok kalau `overwrite` false.
 */
export async function extractZip(zip, entryNames, destDirUri, rootPrefix, overwrite, onProgress) {
  const targets = entryNames.filter((n) => !n.endsWith('/') && (!rootPrefix || n.startsWith(rootPrefix)));
  let done = 0;
  for (const name of targets) {
    const rel = rootPrefix ? name.slice(rootPrefix.length) : name;
    if (!rel) {
      done += 1;
      onProgress?.(done, targets.length);
      continue;
    }
    const targetUri = safeZipMemberPath(destDirUri, rel);
    if (!targetUri) {
      done += 1;
      onProgress?.(done, targets.length);
      continue; // Zip Slip diblokir - skip, gak ditulis (dicatat caller lewat logError)
    }
    const exists = (await FileSystem.getInfoAsync(targetUri).catch(() => ({ exists: false }))).exists;
    if (exists && !overwrite) {
      done += 1;
      onProgress?.(done, targets.length);
      continue;
    }
    const parentUri = targetUri.slice(0, targetUri.lastIndexOf('/'));
    await mkdirRecursive(parentUri);
    const base64 = await zip.files[name].async('base64');
    await FileSystem.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
    done += 1;
    onProgress?.(done, targets.length);
  }
}

/** Salin satu file ke folder tujuan di repo (Upload File / Upload ZIP
 * No Extract) - padanan shutil.copy2() CLI. */
export async function copyFileToRepoFolder(sourceUri, destFolderUri, fileName) {
  await mkdirRecursive(destFolderUri);
  const targetUri = `${destFolderUri.replace(/\/+$/, '')}/${fileName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  return targetUri;
}

/**
 * Daftar sub-folder (root + 1 level ke dalam) buat folder picker tujuan -
 * padanan list_top_level_dirs() CLI. Path relatif diakhiri '/'.
 */
export async function listTopLevelDirs(rootUri, extraLevels = 1) {
  const results = [];
  async function walk(currentUri, rel, depth) {
    let entries;
    try {
      entries = (await FileSystem.readDirectoryAsync(currentUri)).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const fullUri = `${currentUri.replace(/\/+$/, '')}/${name}`;
      const info = await FileSystem.getInfoAsync(fullUri).catch(() => null);
      if (info && info.isDirectory) {
        const relPath = `${rel}${name}/`;
        results.push(relPath);
        if (depth < extraLevels) await walk(fullUri, relPath, depth + 1);
      }
    }
  }
  await walk(rootUri, '', 0);
  return results;
}

/**
 * Setelah zipCore.detectZipRoot() nebak prefix wrapper, "kupas dulu"
 * kesalahan tebak yang paling umum sebelum dipakai (permintaan Zen -
 * kasus nyata: ZIP isinya cuma app/api/siswa/route.js, struktur itu
 * ke-detect sebagai wrapper padahal itu struktur folder yang memang
 * diinginkan):
 *
 *  1. Kalau path hasil deteksi SUDAH ADA di repo tujuan -> itu struktur
 *     asli yang memang dipakai project, bukan folder pembungkus ZIP.
 *     Jangan di-strip (balikin '').
 *  2. Kalau belum ada di repo, tapi hasil setelah di-strip ternyata cuma
 *     1 file sendirian -> wrapper GitHub asli biasanya isinya banyak
 *     file, 1 file sendirian curiga bukan wrapper juga. Jangan di-strip.
 *
 * INI BUKAN JAMINAN 100% BENER (lihat catatan di UploadScreen.js) -
 * makanya tetap ada tombol override manual di layar ZIP Analyzer.
 */
export async function refineDetectedPrefix(prefix, entryNames, destDirUri) {
  if (!prefix) return prefix;

  const candidateUri = `${destDirUri.replace(/\/+$/, '')}/${prefix.replace(/\/+$/, '')}`;
  const alreadyExists = (await FileSystem.getInfoAsync(candidateUri).catch(() => ({ exists: false }))).exists;
  if (alreadyExists) return '';

  const relNames = entryNames.filter((n) => n.startsWith(prefix)).map((n) => n.slice(prefix.length)).filter(Boolean);
  const stats = countZipItems(relNames);
  if (stats.files === 1 && stats.dirs === 0) return '';

  return prefix;
}
