/**
 * compareRepository.js
 * Fetch dari GitHub (silent) lalu hitung ahead/behind, tentukan status
 * (Alur 3.3). Working tree (file belum di-commit) SENGAJA tidak
 * dicampur ke status ini - itu ditangani terpisah oleh getWorkingTreeStatus()
 * di bawah, persis catatan eksplisit di dokumen konsep poin 3.3.3.
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { fs } from './fsAdapter';
import { logError, logDebug } from '../logging/logger';
import { toFriendlyMessage } from './friendlyError';
import { getStatusMatrixCached } from './statusCache';

class CompareError extends Error {}

// PERF (8 Agustus 2026, laporan Zen "repo 1MB aja lemot 30 detik"): AKAR
// MASALAH SEBENARNYA bukan ukuran repo/jumlah file - tapi JUMLAH COMMIT
// di histori. Ngitung ahead/behind manggil git.readCommit() satu-satu
// lewat bridge expo-file-system, dan diffAheadBehind() di bawah jalanin
// walk ini SAMPAI 4X (collectOids buat remote, collectOids buat local,
// countCommitsNotIn buat ahead, countCommitsNotIn buat behind) - padahal
// collectOids(localOid) dan countCommitsNotIn(localOid, ...) SAMA-SAMA
// mulai jalan dari localOid, jadi commit yang sama kebaca ulang lewat
// bridge tiap walk, bukan sekali. Repo aktif dengan ratusan commit kecil
// = ratusan-ribuan round trip bridge tiap buka Dashboard, walau isi
// working dir cuma 1MB.
//
// Fix: `cache` (Map oid->commit) dioper bareng ke semua walk dalam SATU
// pemanggilan diffAheadBehind() - commit yang sudah kebaca di satu walk
// gak perlu nembak fs lagi di walk berikutnya. Hasil/urutan/logic PERSIS
// SAMA kayak sebelumnya (bukan ganti algoritma, cuma hilangin baca
// ulang yang sia-sia), jadi angka ahead/behind tetap akurat.
async function readCommitCached(dir, oid, cache) {
  if (cache.has(oid)) return cache.get(oid);
  const commit = await git.readCommit({ fs, dir, oid }).catch(() => null);
  cache.set(oid, commit);
  return commit;
}

/**
 * Hitung berapa commit yang cuma ada di `fromOid` (tidak reachable dari
 * `toOid`), setara `git rev-list toOid..fromOid --count`. Berhenti pas
 * ketemu commit yang juga ada di sisi lain (irisan/ancestor bersama) atau
 * setelah `limit` commit, supaya tidak menyisir seluruh histori repo besar.
 */
export async function countCommitsNotIn(dir, fromOid, otherOidSet, limit = 250, cache = new Map()) {
  let count = 0;
  const visited = new Set();
  const queue = [fromOid];
  while (queue.length && count < limit) {
    const oid = queue.shift();
    if (!oid || visited.has(oid)) continue;
    visited.add(oid);
    if (otherOidSet.has(oid)) continue; // ketemu leluhur bersama, berhenti di jalur ini
    count += 1;
    const commit = await readCommitCached(dir, oid, cache);
    if (commit) queue.push(...commit.commit.parent);
  }
  return count;
}

export async function collectOids(dir, oid, limit = 250, cache = new Map()) {
  const set = new Set();
  const queue = [oid];
  while (queue.length && set.size < limit) {
    const cur = queue.shift();
    if (!cur || set.has(cur)) continue;
    set.add(cur);
    const commit = await readCommitCached(dir, cur, cache);
    if (commit) queue.push(...commit.commit.parent);
  }
  return set;
}

export async function compareRepository({ dir, token, remoteBranch }) {
  try {
    await git.fetch({
      fs,
      http,
      dir,
      ref: remoteBranch,
      singleBranch: true,
      tags: false,
      onAuth: token ? () => ({ username: token }) : undefined,
    });
    await logDebug(`Fetch untuk compare selesai (${dir})`);
  } catch (e) {
    await logError('Fetch saat compare gagal', e?.message);
    throw new CompareError(toFriendlyMessage(e));
  }

  const result = await diffAheadBehind(dir, remoteBranch);
  if (!result) {
    throw new CompareError('Tidak dapat membaca riwayat commit repo ini.');
  }
  return result;
}

/** Logic inti hitung ahead/behind dari ref lokal - dipakai bersama oleh
 * compareRepository() (setelah fetch) dan getLocalAheadBehind() (tanpa
 * fetch, lihat di bawah). Return null kalau ref lokal/remote gak kebaca
 * (caller yang tentukan itu error fatal atau cuma "belum diketahui"). */
async function diffAheadBehind(dir, remoteBranch) {
  const localOid = await git.resolveRef({ fs, dir, ref: remoteBranch }).catch(() => null);
  const remoteOid = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${remoteBranch}` }).catch(() => null);

  if (!localOid || !remoteOid) return null;
  if (localOid === remoteOid) return { status: 'synced', ahead: 0, behind: 0 };

  const cache = new Map(); // shared antar 4 walk di bawah - lihat catatan PERF di atas
  const remoteAncestors = await collectOids(dir, remoteOid, 250, cache);
  const localAncestors = await collectOids(dir, localOid, 250, cache);

  const ahead = await countCommitsNotIn(dir, localOid, remoteAncestors, 250, cache);
  const behind = await countCommitsNotIn(dir, remoteOid, localAncestors, 250, cache);

  let status;
  if (ahead > 0 && behind > 0) status = 'diverged';
  else if (ahead > 0) status = 'ahead';
  else if (behind > 0) status = 'behind';
  else status = 'synced';

  return { status, ahead, behind };
}

/**
 * Versi OFFLINE dari perbandingan ahead/behind - TIDAK melakukan fetch,
 * cuma baca ref lokal yang sudah ada (hasil fetch/clone terakhir). Dipakai
 * Storage Manager (keputusan 10.1) supaya bisa nunjukin badge "ada
 * perubahan belum di-push" buat SEMUA repo lokal tanpa nembak GitHub API
 * satu-satu (mahal & bisa kena rate limit kalau repo-nya banyak).
 *
 * Beda dari compareRepository(): kalau ref gak kebaca, balikin status
 * 'unknown' (bukan throw) - karena di Storage Manager ini cuma salah satu
 * dari banyak badge di list, bukan hasil utama satu layar seperti di
 * CompareScreen. Konsekuensi lain: datanya bisa basi kalau remote sudah
 * berubah sejak fetch/clone terakhir - trade-off yang disengaja.
 */
export async function getLocalAheadBehind(dir, remoteBranch) {
  const result = await diffAheadBehind(dir, remoteBranch);
  return result || { status: 'unknown', ahead: 0, behind: 0 };
}

/** Working tree terpisah dari status commit di atas (poin 3.3.3 - wajib
 * dipertahankan supaya maknanya tidak tercampur). */
export async function getWorkingTreeStatus(dir) {
  const rows = await getStatusMatrixCached(dir);
  let modified = 0;
  for (const [, head, workdir, stage] of rows) {
    if (head !== workdir || workdir !== stage) modified += 1;
  }
  return modified > 0 ? 'modified' : 'clean';
}

export { CompareError };
