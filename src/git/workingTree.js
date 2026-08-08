/**
 * workingTree.js
 * Padanan gitadd.py + commit.py CLI asli. Fungsi-fungsi di sini murni
 * logic/data (dipanggil dari WorkingTreeScreen.js).
 *
 * Beda dari CLI (dicatat, bukan kelewat):
 *  - CLI dapet status lewat `git status --porcelain` (parsing teks output
 *    binary git). Kita gak punya binary git - dipakai git.statusMatrix()
 *    isomorphic-git, hasilnya array [filepath, head, workdir, stage] per
 *    file. Diterjemahkan ke kategori yang sama (Baru/Diubah/Dihapus) di
 *    classifyRow().
 *  - Guard "harus ada staged file" & "pesan gak boleh kosong" sebelum
 *    commit WAJIB dipertahankan persis - itu eksplisit di CLI asli.
 */

import git from 'isomorphic-git';
import * as FileSystem from 'expo-file-system';
import { fs } from './fsAdapter';
import { logActivity, logError } from '../logging/logger';
import { toFriendlyMessage } from './friendlyError';
import { getStatusMatrixCached, invalidateStatusCache } from './statusCache';
import { HEAVY_FOLDERS } from './heavyFolders';

/** Klasifikasi 1 baris statusMatrix jadi kategori yang gampang dibaca +
 * dua flag (unstagedChange/stagedChange) buat nentuin file itu tampil di
 * daftar "bisa di-Add" atau "bisa di-Unstage". */
function classifyRow([filepath, head, workdir, stage]) {
  const unstagedChange = workdir !== stage;
  const stagedChange = stage !== head;
  if (!unstagedChange && !stagedChange) return null; // unmodified, gak perlu ditampilkan

  let category;
  if (head === 0) category = 'Baru';
  else if (workdir === 0) category = 'Dihapus';
  else category = 'Diubah';

  return { filepath, category, unstagedChange, stagedChange, isDeleteOnDisk: workdir === 0 };
}

/** Status detail working tree - padanan git_status_lengkap() + tampilkan_status(). */
export async function getDetailedStatus(dir) {
  const rows = await getStatusMatrixCached(dir);
  const entries = rows.map(classifyRow).filter(Boolean);
  const unstaged = entries.filter((e) => e.unstagedChange);
  const staged = entries.filter((e) => e.stagedChange);
  const counts = { modified: 0, added: 0, deleted: 0, untracked: 0 };
  for (const e of entries) {
    if (e.category === 'Dihapus') counts.deleted += 1;
    else if (e.category === 'Baru') counts[e.stagedChange ? 'added' : 'untracked'] += 1;
    else counts.modified += 1;
  }
  return { entries, unstaged, staged, counts, clean: entries.length === 0 };
}

async function addOnePath(dir, entry) {
  if (entry.isDeleteOnDisk) {
    await git.remove({ fs, dir, filepath: entry.filepath });
  } else {
    await git.add({ fs, dir, filepath: entry.filepath });
  }
}

/** Add Semua - padanan add_semua() (git add -A). */
export async function addAll(dir, unstagedEntries) {
  for (const entry of unstagedEntries) {
    await addOnePath(dir, entry);
  }
  invalidateStatusCache(dir);
  await logActivity(`Git Add berhasil (semua file, ${unstagedEntries.length})`);
}

/** Add File Tertentu - padanan add_file_tertentu(). */
export async function addSelected(dir, entries) {
  for (const entry of entries) {
    await addOnePath(dir, entry);
  }
  invalidateStatusCache(dir);
  await logActivity(`Git Add berhasil (${entries.length} file)`);
}

/** Unstage - padanan unstage() (git restore --staged / git reset). */
export async function unstagePaths(dir, filepaths) {
  for (const filepath of filepaths) {
    await git.resetIndex({ fs, dir, filepath });
  }
  invalidateStatusCache(dir);
  await logActivity(`Unstage berhasil (${filepaths.length} file)`);
}

/**
 * Buat Commit - padanan buat_commit(). Guard dipertahankan persis:
 * harus ada staged file, pesan gak boleh kosong. `author` wajib diisi
 * {name, email} - isomorphic-git gak punya konsep git config --global,
 * jadi identitas diambil dari profil GitHub yang login (lihat App.js).
 */
export async function commitChanges(dir, message, author) {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    throw new Error('Pesan commit tidak boleh kosong.');
  }
  const status = await getDetailedStatus(dir);
  if (status.staged.length === 0) {
    throw new Error('Tidak ada file di staging area. Gunakan "Add" terlebih dahulu.');
  }
  try {
    const oid = await git.commit({ fs, dir, message: trimmed, author });
    invalidateStatusCache(dir);
    await logActivity(`Commit berhasil (${oid.slice(0, 7)})`);
    return oid;
  } catch (e) {
    await logError('Commit gagal', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}

/** Commit Terakhir - padanan commit_terakhir(). */
export async function getLastCommit(dir) {
  const log = await git.log({ fs, dir, depth: 1 }).catch(() => []);
  if (!log.length) return null;
  const c = log[0];
  return { oid: c.oid, shortOid: c.oid.slice(0, 7), author: c.commit.author.name, date: new Date(c.commit.author.timestamp * 1000), message: c.commit.message.split('\n')[0] };
}

/** Riwayat Commit (20 terakhir) - padanan riwayat_commit(). */
export async function getCommitHistory(dir, limit = 20) {
  const log = await git.log({ fs, dir, depth: limit }).catch(() => []);
  return log.map((c) => ({
    oid: c.oid,
    shortOid: c.oid.slice(0, 7),
    author: c.commit.author.name,
    date: new Date(c.commit.author.timestamp * 1000),
    message: c.commit.message.split('\n')[0],
  }));
}

/** Amend Commit - padanan amend_commit(). Kosongkan pesan baru = pakai
 * pesan lama (isomorphic-git butuh message eksplisit walau amend, beda
 * dari `git commit --amend --no-edit` yang otomatis reuse - jadi kalau
 * pesan baru kosong, kita ambil pesan lama dulu terus dipakai lagi). */
export async function amendCommit(dir, newMessage, author) {
  const last = await getLastCommit(dir);
  if (!last) {
    throw new Error('Belum ada commit untuk di-amend.');
  }
  const message = (newMessage || '').trim() || last.message;
  try {
    const oid = await git.commit({ fs, dir, message, author, amend: true });
    invalidateStatusCache(dir);
    await logActivity(`Amend commit berhasil (${oid.slice(0, 7)})`);
    return oid;
  } catch (e) {
    await logError('Amend commit gagal', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}

// ---------------------------------------------------------------------
// FITUR BARU (permintaan Zen, bukan dari CLI asli): cek folder berat umum
// yang gak ke-cover .gitignore sebelum user nge-Add, biar gak gak sengaja
// commit node_modules dkk.
//
// (8 Agustus 2026) HEAVY_FOLDERS sekarang diimpor dari heavyFolders.js -
// list yang sama dipakai statusCache.js buat nge-skip folder ini pas
// statusMatrix() supaya gak lag (lihat catatan performa di sana). Dulu
// dua list terpisah gampang out-of-sync kalau nambah satu doang.
// ---------------------------------------------------------------------

function gitignoreCovers(gitignoreContent, folderName) {
  const lines = gitignoreContent.split('\n').map((l) => l.trim());
  return lines.some((line) => {
    if (!line || line.startsWith('#')) return false;
    const cleaned = line.replace(/^\/+/, '').replace(/\/+$/, '');
    return cleaned === folderName || cleaned === `${folderName}/**` || cleaned === '*';
  });
}

/**
 * Cek risiko commit folder berat yang belum di-gitignore. `repoRealDir`
 * itu path filesystem asli (bukan gaya isomorphic-git) - lihat catatan
 * REPOS_ROOT di fsAdapter.js/repoStatus.js soal bedanya.
 */
export async function checkGitignoreRisk(repoRealDir) {
  const gitignoreUri = `${repoRealDir.replace(/\/+$/, '')}/.gitignore`;
  const info = await FileSystem.getInfoAsync(gitignoreUri).catch(() => ({ exists: false }));
  const hasGitignore = info.exists;
  const content = hasGitignore ? await FileSystem.readAsStringAsync(gitignoreUri).catch(() => '') : '';

  let topLevel = [];
  try {
    topLevel = await FileSystem.readDirectoryAsync(repoRealDir);
  } catch {
    topLevel = [];
  }

  const foundHeavy = topLevel.filter((name) => HEAVY_FOLDERS.includes(name));
  const uncovered = hasGitignore ? foundHeavy.filter((name) => !gitignoreCovers(content, name)) : foundHeavy;

  return { hasGitignore, uncovered, checked: foundHeavy.length > 0 };
}
