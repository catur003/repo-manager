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
import { checkoutBranch } from './branchOps';
import { invalidateStatusCache } from './statusCache';

/**
 * Merge Lokal - checkout ke target dulu (persis CLI), baru merge source
 * ke dalamnya. Balikin `{conflict: true}` kalau gagal karena isomorphic-git
 * gak bisa auto-resolve - BUKAN throw, biar UI bisa kasih pesan yang
 * pas (bukan generic error).
 */
export async function mergeLocal(dir, source, target, author) {
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
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('conflict') || msg.includes('merge')) {
      await logActivity(`Merge ${source} ke ${target} gagal - conflict/tidak bisa auto-merge`);
      return { conflict: true };
    }
    throw new Error(toFriendlyMessage(e));
  }
}
