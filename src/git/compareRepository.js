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

/**
 * Hitung berapa commit yang cuma ada di `fromOid` (tidak reachable dari
 * `toOid`), setara `git rev-list toOid..fromOid --count`. Berhenti pas
 * ketemu commit yang juga ada di sisi lain (irisan/ancestor bersama) atau
 * setelah `limit` commit, supaya tidak menyisir seluruh histori repo besar.
 */
async function countCommitsNotIn(dir, fromOid, otherOidSet, limit = 250) {
  let count = 0;
  const visited = new Set();
  const queue = [fromOid];
  while (queue.length && count < limit) {
    const oid = queue.shift();
    if (!oid || visited.has(oid)) continue;
    visited.add(oid);
    if (otherOidSet.has(oid)) continue; // ketemu leluhur bersama, berhenti di jalur ini
    count += 1;
    const commit = await git.readCommit({ fs, dir, oid }).catch(() => null);
    if (commit) queue.push(...commit.commit.parent);
  }
  return count;
}

export async function collectOids(dir, oid, limit = 250) {
  const set = new Set();
  const queue = [oid];
  while (queue.length && set.size < limit) {
    const cur = queue.shift();
    if (!cur || set.has(cur)) continue;
    set.add(cur);
    const commit = await git.readCommit({ fs, dir, oid: cur }).catch(() => null);
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

  const remoteAncestors = await collectOids(dir, remoteOid);
  const localAncestors = await collectOids(dir, localOid);

  const ahead = await countCommitsNotIn(dir, localOid, remoteAncestors);
  const behind = await countCommitsNotIn(dir, remoteOid, localAncestors);

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
