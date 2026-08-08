/**
 * mergeOps.js
 * Padanan merge_lokal() CLI asli (bagian Pull Request di merge.py BUKAN
 * bagian ini - itu nunggu giliran Fase 5 lanjutan, butuh GitHub REST API
 * buat bikin PR, beda scope).
 *
 * KETERBATASAN JUJUR (beda dari CLI): git asli, kalau merge conflict,
 * berhenti di tengah dengan file berisi marker <<<<<<< / ======= /
 * >>>>>>> yang bisa diedit manual, terus di-Add+Commit buat nyelesein.
 * isomorphic-git TIDAK BISA melakukan itu - merge-nya cuma dukung
 * fast-forward & recursive merge yang bersih tanpa conflict. Kalau ada
 * conflict beneran, isomorphic-git GAGAL TOTAL (throw error) tanpa
 * nyentuh working directory sama sekali - jadi "selesaikan manual di
 * file" ala CLI gak bisa direplikasi. Yang bisa ditawarkan cuma:
 * selesaikan lewat GitHub (buka PR, GitHub punya conflict editor web),
 * atau pakai git asli di komputer buat kasus itu.
 */

import git from 'isomorphic-git';
import { fs } from './fsAdapter';
import { logActivity, logError } from '../logging/logger';
import { toFriendlyMessage } from './friendlyError';
import { checkoutBranch, getCurrentBranch } from './branchOps';
import { invalidateStatusCache } from './statusCache';
import { diffCommitFiles } from './diffTrees';

/**
 * Preview file yang bakal beda kalau source digabung ke target -
 * permintaan Zen ("merge ini bisa detect mana yang baru mana yang
 * nggak?"). Dihitung dari diff 2 tip commit (source vs target) - ini
 * pendekatan (approx merge diff), bukan hasil 3-way merge beneran (yang
 * baru ketauan pas benar-benar di-merge), tapi udah cukup buat kasih
 * gambaran sebelum eksekusi.
 */
export async function previewMergeDiff(dir, source, target) {
  const sourceOid = await git.resolveRef({ fs, dir, ref: source }).catch(() => null);
  const targetOid = await git.resolveRef({ fs, dir, ref: target }).catch(() => null);
  if (!sourceOid || !targetOid) return { files: [], remaining: 0, total: 0 };
  return diffCommitFiles(dir, targetOid, sourceOid);
}

/**
 * Merge Lokal - checkout ke target dulu (persis CLI), baru merge source
 * ke dalamnya. Balikin `{conflict: true}` kalau gagal karena isomorphic-git
 * gak bisa auto-resolve - BUKAN throw, biar UI bisa kasih pesan yang
 * pas (bukan generic error).
 */
export async function mergeLocal(dir, source, target, author) {
  // BUGFIX (audit Zen, BUG-6): dulu kalau merge gagal, user ketinggalan
  // di branch TARGET (karena checkoutBranch ke target udah kejadian
  // duluan) - padahal harusnya balik ke branch semula. Sekarang branch
  // asal dicatat dulu, dan di-restore kalau merge-nya gagal (best-effort
  // - kalau restore-nya sendiri gagal juga, biarin di target, jangan
  // sampai nutupin error asli merge-nya).
  const originalBranch = await getCurrentBranch(dir);

  try {
    await checkoutBranch(dir, target);
  } catch (e) {
    throw new Error(`Gagal pindah ke branch target: ${e.message}`);
  }

  try {
    const result = await git.merge({ fs, dir, theirs: source, author, fastForwardOnly: false });
    invalidateStatusCache(dir);
    await logActivity(`Merge ${source} ke ${target} berhasil`);
    return {
      conflict: false,
      fastForward: !!result.fastForward,
      alreadyMerged: !!result.alreadyMerged,
      oid: result.oid,
    };
  } catch (e) {
    await logError(`Merge ${source} ke ${target} gagal`, e?.message);
    if (originalBranch && originalBranch !== target) {
      await checkoutBranch(dir, originalBranch).catch(() => {});
    }
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('conflict') || msg.includes('merge')) {
      await logActivity(`Merge ${source} ke ${target} gagal - conflict/tidak bisa auto-merge, balik ke ${originalBranch || target}`);
      return { conflict: true, restoredBranch: originalBranch };
    }
    throw new Error(toFriendlyMessage(e));
  }
}
