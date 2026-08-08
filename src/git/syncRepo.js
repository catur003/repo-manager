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
import { getStatusMatrixCached, invalidateStatusCache } from './statusCache';
import { getSetting } from './settingsStore';
import { diffCommitFiles } from './diffTrees';
import { formatDateTime } from '../utils/format';

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
/** Daftar file tracked yang kotor (bukan cuma boolean) - dipakai buat
 * scope "buang hasil stash" nanti (audit Zen, BUG-002) supaya checkout
 * discard-nya bisa dibatasi ke file yang BENERAN disentuh stash, bukan
 * reset seluruh working directory. */
async function getTrackedDirtyFiles(dir) {
  const rows = await getStatusMatrixCached(dir);
  return rows
    .filter(([, head, workdir, stage]) => {
      const isUntracked = head === 0 && stage === 0;
      if (isUntracked) return false;
      return head !== workdir || workdir !== stage;
    })
    .map(([filepath]) => filepath);
}

async function hasTrackedDirtyChanges(dir) {
  const files = await getTrackedDirtyFiles(dir);
  return files.length > 0;
}

/** Push biasa - padanan push(). Preflight: harus ada remote (selalu ada
 * di app ini karena repo selalu hasil clone). Kalau ditolak
 * (non-fast-forward), balikin `{rejected: true}` supaya UI bisa nawarin
 * Pull dulu - persis BUGFIX yang dicatat di push.py CLI asli. */
export async function pushRepo(dir, branch, token) {
  const beforeOid = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` }).catch(() => null);
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
      // BUGFIX (audit Zen, NEW-9): dulu cek 'reject' sendirian - pola
      // lama yang SAMA persis sama bug yang udah diperbaiki di
      // friendlyError.js (kata "reject" muncul juga di error gak
      // terkait, mis. wrapper Promise Rejection RN). Fix di
      // friendlyError.js gak otomatis kepakai di sini karena jalur ini
      // gak lewat toFriendlyMessage() - jadi wajib dibenerin terpisah,
      // sama syaratnya: kata "push" WAJIB ikut ada.
      if (msg.includes('push') && (msg.includes('reject') || msg.includes('fast-forward'))) {
        await logError('Push ditolak (non-fast-forward)', result.error);
        return { rejected: true };
      }
      await logError('Push gagal', result.error);
      throw new Error(result.error || 'Push gagal');
    }
    await logActivity(`Push berhasil (${branch})`);
    await updateRepoEvent(dir, 'lastPush', branch);
    const afterOid = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null);
    const changedFiles = await diffCommitFiles(dir, beforeOid, afterOid).catch(() => null);
    return { rejected: false, ok: true, changedFiles };
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('push') && (msg.includes('reject') || msg.includes('fast-forward'))) {
      await logError('Push ditolak (non-fast-forward)', e?.message);
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
    await updateRepoEvent(dir, 'lastPush', branch);
  } catch (e) {
    await logError('Force Push gagal', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}

/**
 * Pull - padanan pull(). Kalau working tree kotor DAN auto-stash aktif
 * (setting, default nyala - bisa dimatiin di Settings, permintaan Zen 7
 * Agustus 2026): auto-stash dulu (tracked files aja, sama kayak git asli
 * tanpa -u), pull, terus 'apply' stash-nya balik (BUKAN 'pop' - lihat
 * catatan panjang di atas kenapa). Stash TETAP DISIMPAN setelah apply -
 * baru bener-bener kehapus kalau user manggil confirmStashSafe() setelah
 * ngecek hasilnya aman.
 *
 * Kalau auto-stash DIMATIKAN dan working tree kotor: pull ditolak duluan
 * (blockedDirty), minta user commit dulu - lebih terbatas tapi paling
 * transparan buat yang gak mau app "sok tau" ngutak-atik stash otomatis.
 *
 * SAFETY FIX (7 Agustus 2026, masukan Zen): message stash dikasih
 * timestamp unik + verifikasi lewat listStash() sebelum drop - BUKAN
 * asal drop refIdx:0.
 *
 * Balikin juga `changedFiles` (hasil diffCommitFiles antara HEAD sebelum
 * & sesudah pull) buat ringkasan informatif di UI (permintaan Zen #5).
 */
export async function pullRepo(dir, branch, token, author) {
  const stashedFiles = await getTrackedDirtyFiles(dir);
  const wasDirty = stashedFiles.length > 0;
  const autoStashEnabled = await getSetting('autoStash');
  const stashMessage = `auto-stash-before-pull:${Date.now()}`;

  if (wasDirty && !autoStashEnabled) {
    return {
      ok: false,
      blockedDirty: true,
      error: 'Ada perubahan lokal belum di-commit dan auto-stash sedang dimatikan (Settings). Commit dulu perubahannya, atau nyalakan auto-stash lagi.',
    };
  }

  const willStash = wasDirty && autoStashEnabled;

  if (willStash) {
    try {
      await git.stash({ fs, dir, op: 'push', message: stashMessage });
      invalidateStatusCache(dir);
      await logActivity('Auto-stash sebelum pull berhasil');
    } catch (e) {
      await logError('Gagal auto-stash sebelum pull', e?.message);
      throw new Error('Gagal menyimpan sementara perubahan lokal (stash). Pull dibatalkan, tidak ada yang berubah.');
    }
  }

  const beforeOid = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null);

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
    if (willStash) {
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

  invalidateStatusCache(dir);
  await logActivity(`Pull berhasil (${branch})`);
  await updateRepoEvent(dir, 'lastPull', branch);

  const afterOid = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null);
  const changedFiles = await diffCommitFiles(dir, beforeOid, afterOid).catch(() => null);

  if (!willStash) {
    return { ok: true, stashApplied: false, changedFiles };
  }

  try {
    await git.stash({ fs, dir, op: 'apply' });
    invalidateStatusCache(dir);
    await logActivity('Stash diterapkan balik setelah pull');
    return { ok: true, stashApplied: true, stashKept: true, stashMessage, changedFiles, stashedFiles };
  } catch (e) {
    await logError('Gagal apply stash setelah pull', e?.message);
    return {
      ok: true,
      stashApplied: false,
      stashKept: true,
      stashMessage,
      changedFiles,
      stashedFiles,
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
  return rawMessageOf(entry).includes(stashMessage);
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
 * sekali. Stash-nya tetap utuh di daftar buat dicoba lagi manual nanti.
 *
 * BUGFIX (audit Zen, BUG-002): dulu `git.checkout({force:true})` TANPA
 * `filepaths` - reset SELURUH working directory ke HEAD, bukan cuma file
 * yang disentuh stash. Kalau ada perubahan lain yang somehow nyangkut di
 * antara apply dan tombol ini dipencet, ikut kebuang juga. Sekarang
 * `filepaths` WAJIB diisi (daftar file yang ditangkap SEBELUM stash push
 * di pullRepo() - lihat `stashedFiles` di return value-nya) - checkout
 * di-scope cuma ke file-file itu.
 */
export async function discardAppliedStash(dir, filepaths) {
  if (!filepaths || filepaths.length === 0) {
    // Gak ada daftar file (mis. dipanggil dari alur lama/gak lengkap) -
    // mending gak ngapa-ngapain daripada nebak-nebak reset semua.
    throw new Error('Gak ada daftar file yang perlu dibalikin - tidak ada yang dilakukan (aman).');
  }
  await git.checkout({ fs, dir, ref: 'HEAD', force: true, filepaths });
  invalidateStatusCache(dir);
  await logActivity(`Hasil stash apply dibuang untuk ${filepaths.length} file (scoped, bukan reset total) - stash tetap disimpan`);
}

export async function listStash(dir) {
  const result = await git.stash({ fs, dir, op: 'list' });
  return result || [];
}

function rawMessageOf(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return entry.message || entry.msg || entry.subject || JSON.stringify(entry);
  return String(entry);
}

/**
 * Daftar stash dengan label gampang dibaca - permintaan Zen ("stash
 * bernama apa random bikin bingung"). Nama mentah dari auto-stash
 * (`auto-stash-before-pull:<timestamp milidetik>`) diterjemahkan jadi
 * "Auto-stash sebelum Pull - <tanggal jam>". Stash lain (manual, dari
 * mana pun - termasuk terminal kalau nanti dibikin) ditampilkan apa
 * adanya, gak dipaksa diterjemahkan.
 */
export async function getFormattedStashList(dir) {
  const raw = await listStash(dir);
  return raw.map((entry, index) => {
    const message = rawMessageOf(entry);
    const match = message.match(/^auto-stash-before-pull:(\d+)/);
    const label = match ? `Auto-stash sebelum Pull - ${formatDateTime(new Date(Number(match[1])))}` : message || `Stash #${index}`;
    return { index, label, rawMessage: message };
  });
}

/** Terapkan satu stash spesifik (dari daftar manual, bukan alur auto-pull) - 'apply', stash TETAP ada setelahnya (sama alasan keamanan seperti di pullRepo). */
export async function applyStashAt(dir, index) {
  await git.stash({ fs, dir, op: 'apply', refIdx: index });
  invalidateStatusCache(dir);
  await logActivity(`Stash #${index} diterapkan (manual)`);
}

/** Hapus satu stash spesifik dari daftar manual. */
export async function dropStashAt(dir, index) {
  await git.stash({ fs, dir, op: 'drop', refIdx: index });
  await logActivity(`Stash #${index} dihapus (manual)`);
}

/** Fetch - padanan fetch(). Cuma update info remote, gak gabung apa pun. */
/** Fetch - padanan fetch(). Cuma update info remote, gak gabung apa pun.
 * BUGFIX (7 Agustus 2026, laporan Zen): dulu `singleBranch: true` (cuma
 * update 1 branch) + gak ada `prune` sama sekali - jadi Sync Branch gak
 * pernah nangkep branch yang udah dihapus di GitHub (ref remote-tracking
 * lokalnya nyangkut terus). CLI asli pakai `git fetch --prune origin`
 * (semua branch + buang yang udah gak ada di remote) - sekarang disamain. */
export async function fetchRepo(dir, branch, token) {
  try {
    await git.fetch({ fs, http, dir, tags: false, prune: true, onAuth: () => ({ username: token }) });
    await logActivity(`Fetch berhasil (${branch})`);
  } catch (e) {
    await logError('Fetch gagal', e?.message);
    throw new Error(toFriendlyMessage(e));
  }
}
