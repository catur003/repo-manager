/**
 * syncRepo.js
 * Padanan push.py + pull.py CLI asli.
 *
 * KETERBATASAN JUJUR (beda dari CLI, WAJIB dibaca sebelum ubah file ini):
 * isomorphic-git BUKAN git asli - dua hal yang dipakai CLI gak ada
 * padanannya:
 *   1. TIDAK ADA "git stash". CLI auto-stash working tree kotor sebelum
 *      pull, lalu stash-pop setelahnya. isomorphic-git gak punya API
 *      stash sama sekali. Reimplementasi manual (commit sementara lalu
 *      soft-reset) itu BERISIKO (bisa kehilangan data kalau ditulis
 *      buru-buru) - jadi SENGAJA TIDAK dibuat. Sebagai gantinya: pull
 *      diblokir kalau working tree kotor, minta user commit dulu lewat
 *      Working Tree screen. Lebih terbatas dari CLI, tapi aman.
 *   2. Merge isomorphic-git cuma dukung fast-forward & merge sederhana
 *      tanpa conflict. Kalau ada conflict beneran, isomorphic-git throw
 *      error (BUKAN nulis conflict marker <<<<<<< di file kayak git
 *      asli) - jadi "selesaikan manual" ala CLI gak bisa direplikasi
 *      persis. User diarahkan ke GitHub web / clone ulang buat kasus itu.
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { fs } from './fsAdapter';
import { logActivity, logError } from '../logging/logger';
import { toFriendlyMessage } from './friendlyError';
import { getWorkingTreeStatus } from './compareRepository';
import { updateRepoEvent } from './localRepos';

/** Push biasa - padanan push(). Preflight: harus ada remote (selalu ada
 * di app ini karena repo selalu hasil clone). Kalau ditolak
 * (non-fast-forward), balikin `{rejected: true}` supaya UI bisa nawarin
 * Pull dulu - persis BUGFIX yang dicatat di push.py CLI asli. */
export async function pushRepo(dir, branch, token) {
  try {
    const result = await git.push({
      fs,
      http,
      dir,
      ref: branch,
      remoteRef: branch,
      onAuth: () => ({ username: token }),
    });
    if (result.ok === false || result?.error) {
      const msg = String(result.error || '').toLowerCase();
      if (msg.includes('reject') || msg.includes('fast-forward')) {
        return { rejected: true };
      }
      throw new Error(result.error || 'Push gagal');
    }
    await logActivity(`Push berhasil (${branch})`);
    await updateRepoEvent(dir, 'lastPush');
    return { rejected: false, ok: true };
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('reject') || msg.includes('fast-forward')) {
      return { rejected: true };
    }
    await logError('Push gagal', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}

/** Force Push - padanan force_push(). Konfirmasi ketik "YA" WAJIB
 * dilakukan DI LAYAR (bukan di sini) sebelum fungsi ini dipanggil -
 * fungsi ini sendiri gak minta konfirmasi apa pun, murni eksekusi,
 * persis pemisahan tanggung jawab CLI (confirm_text() di layer UI). */
export async function forcePushRepo(dir, branch, token) {
  try {
    await git.push({ fs, http, dir, ref: branch, remoteRef: branch, force: true, onAuth: () => ({ username: token }) });
    await logActivity(`Force Push berhasil (${branch})`);
    await updateRepoEvent(dir, 'lastPush');
  } catch (e) {
    await logError('Force Push gagal', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}

/**
 * Pull - padanan pull(). Beda dari CLI: TIDAK auto-stash (lihat catatan
 * di atas) - kalau working tree kotor, ditolak duluan sebelum coba pull
 * sama sekali, balikin `{blockedDirty: true}`.
 */
export async function pullRepo(dir, branch, token, author) {
  const treeStatus = await getWorkingTreeStatus(dir);
  if (treeStatus === 'modified') {
    return { blockedDirty: true };
  }

  try {
    await git.pull({
      fs,
      http,
      dir,
      ref: branch,
      singleBranch: true,
      author,
      onAuth: () => ({ username: token }),
    });
    await logActivity(`Pull berhasil (${branch})`);
    await updateRepoEvent(dir, 'lastPull');
    return { ok: true };
  } catch (e) {
    await logError('Pull gagal', e?.message);
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('merge') || msg.includes('conflict')) {
      throw new Error(
        'Pull gagal karena ada conflict yang tidak bisa digabung otomatis. Selesaikan lewat GitHub web, atau clone ulang repo ini kalau perubahan lokal belum penting.'
      );
    }
    throw new Error(toFriendlyMessage(e));
  }
}

/** Fetch - padanan fetch(). Cuma update info remote, gak gabung apa pun. */
export async function fetchRepo(dir, branch, token) {
  try {
    await git.fetch({ fs, http, dir, ref: branch, singleBranch: true, tags: false, onAuth: () => ({ username: token }) });
    await logActivity(`Fetch berhasil (${branch})`);
  } catch (e) {
    await logError('Fetch gagal', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}
