/**
 * syncRepo.js
 * Padanan push.py + pull.py CLI asli.
 *
 * UPDATE (7 Agustus 2026): isomorphic-git TERNYATA sudah punya API
 * git.stash() (push/pop/apply/drop/list/clear/create) - koreksi dari Zen,
 * catatan lama di sini yang bilang "gak ada stash sama sekali" SALAH,
 * sudah diperbaiki. Tapi tetap ada keterbatasan dibanding git asli yang
 * bikin desainnya beda dari CLI (bukan port 1:1 penuh):
 *
 *   1. Cuma tracked files yang ke-stash (persis kayak git asli tanpa
 *      flag -u, jadi bukan penyimpangan besar).
 *   2. PALING PENTING: dokumentasi resminya bilang eksplisit - "apply/pop
 *      akan overwrite working directory, TIDAK ADA abort kalau ada
 *      conflict". Beda dari git asli yang nolak nge-drop stash kalau
 *      pop-nya conflict. Karena isomorphic-git gak bisa deteksi conflict
 *      itu sendiri, kita PAKAI 'apply' (bukan 'pop') supaya stash-nya
 *      TETAP ada sebagai cadangan setelah diterapkan balik - user diminta
 *      cek hasilnya dulu, baru hapus manual (git.stash op:'drop') kalau
 *      semua oke. Ini pendekatan paling aman yang bisa dilakukan tanpa
 *      kemampuan deteksi conflict yang isomorphic-git sendiri gak punya.
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { fs } from './fsAdapter';
import { logActivity, logError } from '../logging/logger';
import { toFriendlyMessage } from './friendlyError';
import { updateRepoEvent } from './localRepos';

/**
 * BUGFIX (7 Agustus 2026, laporan Zen): dulu pakai getWorkingTreeStatus()
 * biasa buat nentuin perlu stash atau enggak - itu ngitung SEMUA
 * perubahan termasuk file untracked (baru, belum pernah di-Add). Masalahnya
 * git.stash() isomorphic-git CUMA nyimpen tracked files (dikonfirmasi di
 * docs resminya). Jadi kalau yang bikin "kotor" cuma file baru dari Upload
 * yang belum di-Add, stash gak punya apa-apa buat disimpan -> isomorphic-git
 * lempar error "nothing to stash" -> Pull gagal total, padahal harusnya
 * tetap bisa jalan (file untracked gak akan ketimpa pull).
 *
 * Fungsi ini cek KHUSUS tracked files yang berubah - file untracked murni
 * (head===0 && stage===0, belum pernah di-Add sama sekali) diabaikan,
 * gak dianggap alasan buat stash.
 */
async function hasTrackedDirtyChanges(dir) {
  const rows = await git.statusMatrix({ fs, dir });
  return rows.some(([, head, workdir, stage]) => {
    const isUntracked = head === 0 && stage === 0;
    if (isUntracked) return false;
    return head !== workdir || workdir !== stage;
  });
}

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
 * Pull - padanan pull(). Kalau working tree kotor: auto-stash dulu
 * (tracked files aja, sama kayak git asli tanpa -u), pull, terus 'apply'
 * stash-nya balik (BUKAN 'pop' - lihat catatan panjang di atas kenapa).
 * Stash TETAP DISIMPAN setelah apply - baru bener-bener kehapus kalau
 * user manggil confirmStashSafe() setelah ngecek hasilnya aman.
 *
 * SAFETY FIX (7 Agustus 2026, masukan Zen): message stash dikasih
 * timestamp unik + verifikasi lewat listStash() sebelum drop - BUKAN
 * asal drop refIdx:0. Ini penting bukan cuma buat rencana terminal masa
 * depan, tapi juga kasus sekarang: kalau user pull dua kali beruntun
 * tanpa konfirmasi yang pertama, refIdx bisa geser dan salah hapus stash
 * kalau gak diverifikasi dulu.
 */
export async function pullRepo(dir, branch, token, author) {
  const wasDirty = await hasTrackedDirtyChanges(dir);
  const stashMessage = `auto-stash-before-pull:${Date.now()}`;

  if (wasDirty) {
    try {
      await git.stash({ fs, dir, op: 'push', message: stashMessage });
      await logActivity('Auto-stash sebelum pull berhasil');
    } catch (e) {
      await logError('Gagal auto-stash sebelum pull', e?.message);
      throw new Error('Gagal menyimpan sementara perubahan lokal (stash). Pull dibatalkan, tidak ada yang berubah.');
    }
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
  } catch (e) {
    await logError('Pull gagal', e?.message);
    if (wasDirty) {
      // Pull gagal SEBELUM sempat apply stash lagi - perubahan lokal
      // masih aman tersimpan utuh di stash, belum disentuh sama sekali.
      return { ok: false, stashKept: true, error: 'Pull gagal. Perubahan lokal kamu aman tersimpan di stash (belum diterapkan balik) - coba lagi nanti, atau buka daftar stash buat ambil manual.' };
    }
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('merge') || msg.includes('conflict')) {
      throw new Error('Pull gagal karena ada conflict yang tidak bisa digabung otomatis. Selesaikan lewat GitHub web, atau clone ulang repo ini kalau perubahan lokal belum penting.');
    }
    throw new Error(toFriendlyMessage(e));
  }

  await logActivity(`Pull berhasil (${branch})`);
  await updateRepoEvent(dir, 'lastPull');

  if (!wasDirty) {
    return { ok: true, stashApplied: false };
  }

  try {
    await git.stash({ fs, dir, op: 'apply' });
    await logActivity('Stash diterapkan balik setelah pull');
    return { ok: true, stashApplied: true, stashKept: true, stashMessage };
  } catch (e) {
    await logError('Gagal apply stash setelah pull', e?.message);
    return {
      ok: true,
      stashApplied: false,
      stashKept: true,
      stashMessage,
      error: 'Pull berhasil, TAPI gagal menerapkan balik perubahan lokal dari stash. Perubahan kamu masih aman tersimpan di stash - buka daftar stash buat coba lagi manual.',
    };
  }
}

/**
 * Dipanggil kalau user konfirmasi hasil apply-nya AMAN. Cari dulu stash
 * yang message-nya cocok PERSIS (bukan prefix statis "auto-stash-before-
 * pull" doang - itu dikasih timestamp milidetik unik pas push, lihat
 * stashMessage di pullRepo() di atas) - bukan asal refIdx:0.
 *
 * entryMatches() sengaja jaga-jaga dua bentuk data, karena dokumentasi
 * resmi isomorphic-git gak jelas nunjukin git.stash({op:'list'}) balikin
 * array string atau array object ({message: ...}) - daripada nebak salah
 * dan diam-diam selalu gagal cocok, dicek dua-duanya.
 */
function entryMatches(entry, stashMessage) {
  if (typeof entry === 'string') return entry.includes(stashMessage);
  if (entry && typeof entry === 'object') {
    const text = entry.message || entry.msg || entry.subject || JSON.stringify(entry);
    return String(text).includes(stashMessage);
  }
  return false;
}

export async function confirmStashSafe(dir, stashMessage) {
  const list = await listStash(dir);
  const idx = list.findIndex((entry) => entryMatches(entry, stashMessage));
  if (idx === -1) {
    return { dropped: false, reason: 'not_found' };
  }
  await git.stash({ fs, dir, op: 'drop', refIdx: idx });
  await logActivity('Auto-stash dihapus (dikonfirmasi aman oleh user)');
  return { dropped: true };
}

/**
 * Dipanggil kalau user bilang hasil apply-nya BERMASALAH. Buang hasil
 * 'apply' dari working directory (checkout paksa balik ke HEAD - yaitu
 * kondisi abis pull, SEBELUM stash diterapkan), TANPA nyentuh stash sama
 * sekali. Stash-nya tetap utuh di daftar buat dicoba lagi manual nanti
 * (termasuk kalau nanti ada fitur terminal, bisa "git stash pop" manual
 * dari situ - jawaban langsung buat pertanyaan Zen).
 */
export async function discardAppliedStash(dir) {
  await git.checkout({ fs, dir, force: true });
  await logActivity('Hasil stash apply dibuang (checkout force ke HEAD) - stash tetap disimpan');
}

export async function listStash(dir) {
  const result = await git.stash({ fs, dir, op: 'list' });
  return result || [];
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
