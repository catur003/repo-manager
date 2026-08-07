/**
 * branchOps.js
 * Padanan branch.py CLI asli.
 *
 * KETERBATASAN JUJUR (beda dari CLI):
 *  - isomorphic-git punya git.deleteBranch(), TAPI beda dari `git branch
 *    -d` asli - deleteBranch isomorphic-git TIDAK melakukan pengecekan
 *    "sudah di-merge apa belum" sama sekali, langsung hapus (setara `git
 *    branch -D`, bukan `-d`). Supaya pengaman CLI ("belum ter-merge, mau
 *    force delete?") tetap ada, kita cek sendiri manual (isBranchMerged)
 *    dengan jalan commit graph (pola sama seperti getLocalAheadBehind di
 *    compareRepository.js) SEBELUM manggil deleteBranch - bukan
 *    mengandalkan isomorphic-git buat itu.
 *  - Checkout yang gagal karena "would be overwritten" (working tree
 *    kotor bentrok sama file di branch tujuan) - isomorphic-git juga
 *    throw error untuk kasus ini, pesannya diterjemahkan mirip CLI.
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { fs } from './fsAdapter';
import { logActivity, logError } from '../logging/logger';
import { toFriendlyMessage } from './friendlyError';
import { collectOids } from './compareRepository';
import { invalidateStatusCache } from './statusCache';

export async function getCurrentBranch(dir) {
  return (await git.currentBranch({ fs, dir, fullname: false }).catch(() => null)) || null;
}

export async function listLocalBranches(dir) {
  return git.listBranches({ fs, dir }).catch(() => []);
}

/** Nama branch remote TANPA prefix "origin/" - padanan _list_remote_branches() CLI. */
export async function listRemoteBranches(dir, remote = 'origin') {
  const names = await git.listBranches({ fs, dir, remote }).catch(() => []);
  return names.filter((n) => n !== 'HEAD');
}

/**
 * Checkout - padanan checkout_branch(). Pesan "would be overwritten"
 * diterjemahkan sama kayak CLI (biasanya file runtime kayak config/log
 * yang ke-generate ulang tiap app jalan, bukan perubahan penting).
 */
/**
 * Checkout - padanan checkout_branch(). Pesan "would be overwritten"
 * diterjemahkan sama kayak CLI (biasanya file runtime kayak config/log
 * yang ke-generate ulang tiap app jalan, bukan perubahan penting).
 *
 * BUGFIX (7 Agustus 2026, laporan Zen): dulu saya kira `git.checkout()`
 * isomorphic-git otomatis bikin branch lokal baru kalau namanya cuma ada
 * di `refs/remotes/origin/<nama>` (persis kebiasaan `git checkout` asli)
 * - TERNYATA ENGGAK, dicoba langsung sama Zen dan gagal (harus manual
 * bikin branch + pull). Sekarang dicek eksplisit: kalau branch lokal
 * belum ada tapi ada versi remote-nya, bikin dulu branch lokal yang
 * nunjuk ke situ (`git.branch({object: 'refs/remotes/origin/<nama>'})`,
 * `object` terima ref apa aja - dikonfirmasi dari docs resmi) baru
 * checkout - bukan ngarep isomorphic-git ngerjain otomatis.
 */
export async function checkoutBranch(dir, branchName) {
  try {
    const existsLocally = await git.resolveRef({ fs, dir, ref: `refs/heads/${branchName}` }).catch(() => null);
    if (!existsLocally) {
      const remoteOid = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branchName}` }).catch(() => null);
      if (remoteOid) {
        await git.branch({ fs, dir, ref: branchName, object: `refs/remotes/origin/${branchName}` });
        await logActivity(`Branch lokal ${branchName} dibuat ulang dari origin/${branchName}`);
      }
    }
    await git.checkout({ fs, dir, ref: branchName });
    invalidateStatusCache(dir);
    await logActivity(`Branch ${branchName} aktif`);
  } catch (e) {
    await logError('Checkout branch gagal', e?.message);
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('overwritten')) {
      throw new Error(
        'Checkout gagal: ada file yang belum di-commit dan bakal ketimpa branch tujuan. Commit dulu perubahan itu (menu Git Add & Commit), atau kalau memang tidak penting, batalkan perubahannya dulu.'
      );
    }
    throw new Error(toFriendlyMessage(e));
  }
}

/** Buat Branch Baru - padanan buat_branch_baru() (git checkout -b, auto pindah). */
export async function createBranch(dir, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Nama branch tidak boleh kosong.');
  try {
    await git.branch({ fs, dir, ref: trimmed, checkout: true });
    invalidateStatusCache(dir);
    await logActivity(`Branch baru dibuat: ${trimmed}`);
  } catch (e) {
    await logError('Gagal membuat branch', e?.message);
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('already exists')) {
      throw new Error('Nama branch sudah digunakan.');
    }
    throw new Error(toFriendlyMessage(e));
  }
}

/** Rename Branch - padanan rename_branch(). */
export async function renameBranch(dir, oldName, newName) {
  const trimmed = (newName || '').trim();
  if (!trimmed) throw new Error('Nama branch baru tidak boleh kosong.');
  try {
    await git.renameBranch({ fs, dir, oldref: oldName, ref: trimmed });
    await logActivity(`Branch ${oldName} diubah nama menjadi ${trimmed}`);
  } catch (e) {
    await logError('Gagal rename branch', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}

/**
 * Cek branch udah ke-merge ke branch lain apa belum - reimplementasi
 * manual (jalan commit graph) karena isomorphic-git's deleteBranch gak
 * ngecek ini sendiri. "Merged" = HEAD branch itu ada di daftar leluhur
 * commit HEAD `intoBranch`.
 */
export async function isBranchMerged(dir, branchName, intoBranch) {
  const branchOid = await git.resolveRef({ fs, dir, ref: branchName }).catch(() => null);
  const intoOid = await git.resolveRef({ fs, dir, ref: intoBranch }).catch(() => null);
  if (!branchOid || !intoOid) return true; // gak bisa dicek, jangan blokir - lebih aman fallback ke "anggap merged" drpd salah nge-block user
  if (branchOid === intoOid) return true;
  const ancestorsOfInto = await collectOids(dir, intoOid);
  return ancestorsOfInto.has(branchOid);
}

/** Delete Branch (lokal) - padanan delete_branch(), pengaman "belum
 * merge" via isBranchMerged() (lihat catatan di atas). `force=true`
 * dipanggil dari UI setelah user eksplisit konfirmasi force delete. */
export async function deleteBranchLocal(dir, branchName, force = false) {
  // BUGFIX (7 Agustus 2026, laporan Zen - kejadian nyata: hapus branch
  // aktif bikin HEAD nunjuk ke branch yang udah gak ada, Dashboard &
  // Branch screen jadi gak sinkron). isomorphic-git's deleteBranch() TIDAK
  // punya proteksi ini sendiri (dikonfirmasi di docs resminya) - git asli
  // nolak keras ("Cannot delete branch checked out at..."), jadi kita
  // yang cek manual sebelum manggil deleteBranch.
  const current = await getCurrentBranch(dir);
  if (current && current === branchName) {
    return { isCurrent: true };
  }

  if (!force) {
    const mergeCheckTarget = current || null;
    if (mergeCheckTarget) {
      const merged = await isBranchMerged(dir, branchName, mergeCheckTarget);
      if (!merged) {
        return { needsForce: true };
      }
    }
  }
  try {
    await git.deleteBranch({ fs, dir, ref: branchName });
    await logActivity(`Branch ${branchName} dihapus${force ? ' (paksa)' : ''}`);
    return { needsForce: false, deleted: true };
  } catch (e) {
    await logError('Gagal menghapus branch', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}

/** Hapus branch remote - padanan bagian "Hapus Branch Remote" di
 * sync_branch() CLI (git push origin --delete <branch>). */
export async function deleteBranchRemote(dir, branchName, token, remote = 'origin') {
  try {
    await git.push({ fs, http, dir, remote, ref: branchName, delete: true, onAuth: () => ({ username: token }) });
    await logActivity(`Branch remote ${branchName} dihapus`);
  } catch (e) {
    await logError('Gagal menghapus branch remote', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}

async function countAheadBehind(dir, fromOid, otherAncestors, limit = 100) {
  let count = 0;
  const seen = new Set();
  const queue = [fromOid];
  while (queue.length && count < limit) {
    const cur = queue.shift();
    if (!cur || seen.has(cur) || otherAncestors.has(cur)) continue;
    seen.add(cur);
    count += 1;
    const commit = await git.readCommit({ fs, dir, oid: cur }).catch(() => null);
    if (commit) queue.push(...commit.commit.parent);
  }
  return count;
}

/**
 * Sync Branch data - padanan sync_branch() (tanpa fetch di sini, biar
 * caller yang atur - Screen yang manggil fetchRepo() dulu baru fungsi
 * ini). Balikin: branch yang ada di lokal+remote (dengan ahead/behind),
 * yang cuma lokal, dan yang cuma remote.
 */
export async function getBranchSyncData(dir) {
  const [local, remoteBranches, current] = await Promise.all([
    listLocalBranches(dir),
    listRemoteBranches(dir),
    getCurrentBranch(dir),
  ]);

  const remoteSet = new Set(remoteBranches);
  const localSet = new Set(local);

  const both = local.filter((b) => remoteSet.has(b));
  const onlyLocal = local.filter((b) => !remoteSet.has(b));
  const onlyRemote = remoteBranches.filter((b) => !localSet.has(b));

  const bothWithCounts = [];
  for (const b of both) {
    const localOid = await git.resolveRef({ fs, dir, ref: b }).catch(() => null);
    const remoteOid = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${b}` }).catch(() => null);
    let ahead = 0;
    let behind = 0;
    if (localOid && remoteOid && localOid !== remoteOid) {
      const remoteAncestors = await collectOids(dir, remoteOid);
      const localAncestors = await collectOids(dir, localOid);
      ahead = await countAheadBehind(dir, localOid, remoteAncestors);
      behind = await countAheadBehind(dir, remoteOid, localAncestors);
    }
    bothWithCounts.push({ name: b, ahead, behind, isCurrent: b === current });
  }

  return {
    both: bothWithCounts,
    onlyLocal: onlyLocal.map((b) => ({ name: b, isCurrent: b === current })),
    onlyRemote: onlyRemote.map((b) => ({ name: b })),
    current,
  };
}
