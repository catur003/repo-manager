/**
 * useSyncActions.js
 * Logic Push/Pull/Force Push (state + orkestrasi appAlert) dipindah
 * kesini dari CompareScreen supaya bisa dipakai bareng sama menu Push
 * dan Pull yang sekarang berdiri sendiri (permintaan Zen: pisahin kayak
 * CLI, jangan cuma nempel di Compare) - satu implementasi, dua tempat
 * pakai, biar gak ada risiko dua versi logic yang beda-beda (itu yang
 * bikin bug kalau nanti salah satu diubah tapi yang lain kelupaan).
 */

import { useState } from 'react';
import { appAlert } from '../components/AppModals';
import { pushRepo, pullRepo, forcePushRepo, confirmStashSafe, discardAppliedStash } from '../git/syncRepo';
import { getCurrentBranch } from '../git/branchOps';

/** BUGFIX (7 Agustus 2026, laporan Zen): dulu semua aksi sync di sini
 * pakai `repo.defaultBranch` (nilai statis dari clone dulu) - begitu
 * fitur Branch ada (checkout/buat branch baru), ini salah: kalau user
 * checkout ke branch lain, Push/Pull/Force Push tetap nyasar ke branch
 * default yang gak disentuh, branch baru gak pernah beneran ke-push.
 * Sekarang selalu resolve branch AKTIF SAAT INI dulu sebelum aksi apa
 * pun - fallback ke repo.defaultBranch cuma kalau gagal deteksi (HEAD
 * detached, kasus langka). */
async function resolveActiveBranch(repo) {
  const current = await getCurrentBranch(repo.dir);
  return current || repo.defaultBranch;
}

// BUGFIX (audit Zen, BUG-3): Force Push ke branch penting (main/master/
// production) risikonya lebih gede dari branch biasa - histori tim bisa
// ketimpa. Konfirmasi ketik "YA" tetap wajib buat SEMUA branch (gak
// berubah), ini nambah warning EKSTRA khusus kalau namanya cocok pola
// umum branch penting.
const PROTECTED_BRANCH_PATTERNS = [/^main$/i, /^master$/i, /^prod(uction)?$/i, /^release$/i];
function isProtectedBranchName(name) {
  return PROTECTED_BRANCH_PATTERNS.some((re) => re.test(name || ''));
}

/** Format daftar file berubah buat ditempel di pesan appAlert - dibatasi
 * (diffCommitFiles udah nge-cap + hitung sisa), biar gak kepanjangan. */
function formatChangedFiles(changedFiles) {
  if (!changedFiles || !changedFiles.total) return '';
  const list = changedFiles.files.join('\n');
  const more = changedFiles.remaining > 0 ? `\n... dan ${changedFiles.remaining} file lainnya` : '';
  return `\n\nFile berubah (${changedFiles.total}):\n${list}${more}`;
}

/** Peringatan singkat kalau ada file baru (untracked) - gak ikut
 * ke-amanin auto-stash (audit Zen BUG-1), biar user sadar. */
function formatUntrackedWarning(untrackedFiles) {
  if (!untrackedFiles || untrackedFiles.length === 0) return '';
  return `\n\nCatatan: ${untrackedFiles.length} file baru (belum di-Add) gak ikut diamankan stash - biasanya aman, tapi cek dulu kalau ada file yang namanya sama kayak yang baru di-pull.`;
}

export function useSyncActions(repo, token, author, onOpenWorkingTree) {
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Memproses...');
  const [forcePushMode, setForcePushMode] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const doPull = async (onDone) => {
    setBusy(true);
    setBusyLabel('Mengambil (pull)...');
    try {
      const branch = await resolveActiveBranch(repo);
      const res = await pullRepo(repo.dir, branch, token, author);
      setBusy(false);

      if (res.error && !res.ok) {
        if (res.blockedDirty) {
          appAlert('Pull Ditunda', res.error, [
            { text: 'Nanti saja', style: 'cancel' },
            { text: 'Buka Working Tree', style: 'primary', onPress: () => onOpenWorkingTree?.(repo) },
          ]);
          return;
        }
        appAlert('Pull Gagal', res.error);
        return;
      }

      if (res.stashKept) {
        appAlert(
          res.stashApplied ? 'Pull Berhasil' : 'Pull Berhasil, Tapi...',
          res.stashApplied
            ? `Perubahan lokal kamu sudah diterapkan balik. Cek dulu hasilnya (buka Working Tree) - kalau semua aman, hapus cadangan stash. Kalau ada yang aneh, buang hasil terapan dan stash-nya tetap tersimpan.${formatChangedFiles(res.changedFiles)}${formatUntrackedWarning(res.untrackedFiles)}`
            : res.error,
          res.stashApplied
            ? [
                {
                  text: 'Ada Masalah, Buang Hasilnya',
                  style: 'cancel',
                  onPress: async () => {
                    // BUGFIX (audit Zen, BUG-002) - sekarang scoped ke
                    // file yang beneran ditangkap sebelum stash push
                    // (res.stashedFiles), BUKAN reset seluruh working
                    // directory lagi.
                    await discardAppliedStash(repo.dir, res.stashedFiles);
                    appAlert(
                      'Dibatalkan',
                      `${res.stashedFiles.length} file dikembalikan ke kondisi abis pull. Perubahan lain yang gak disentuh stash TIDAK ikut kesentuh. Perubahan lokal aslinya tetap aman tersimpan di stash, coba lagi nanti.`
                    );
                  },
                },
                {
                  text: 'Sudah Aman, Hapus Cadangan',
                  style: 'primary',
                  onPress: async () => {
                    const result = await confirmStashSafe(repo.dir, res.stashMessage);
                    appAlert(
                      result.dropped ? 'Cadangan Dihapus' : 'Stash Tidak Ditemukan',
                      result.dropped ? 'Stash otomatis sudah dibersihkan.' : 'Stash-nya udah gak ada di daftar (mungkin sudah dihapus dari tempat lain) - gak ada yang dihapus, aman.'
                    );
                  },
                },
              ]
            : [{ text: 'Mengerti', style: 'primary' }]
        );
        onDone?.();
        return;
      }

      appAlert('Pull Berhasil', `Perubahan terbaru dari GitHub sudah digabung.${formatChangedFiles(res.changedFiles)}${formatUntrackedWarning(res.untrackedFiles)}`);
      onDone?.();
    } catch (e) {
      setBusy(false);
      appAlert('Pull Gagal', e.message);
    }
  };

  const doPush = async (onDone) => {
    setBusy(true);
    setBusyLabel('Mengirim (push)...');
    try {
      const branch = await resolveActiveBranch(repo);
      const res = await pushRepo(repo.dir, branch, token);
      setBusy(false);
      if (res.rejected) {
        appAlert('Push ditolak', 'Ada perubahan baru di GitHub. Pull dulu, baru coba Push lagi?', [
          { text: 'Batal', style: 'cancel' },
          { text: 'Pull Sekarang', style: 'primary', onPress: () => doPull(onDone) },
        ]);
        return;
      }
      appAlert('Push Berhasil', `Repository: ${repo.fullName}\nBranch: ${branch}${formatChangedFiles(res.changedFiles)}`);
      onDone?.();
    } catch (e) {
      setBusy(false);
      appAlert('Push Gagal', e.message);
    }
  };

  const [protectedBranchWarning, setProtectedBranchWarning] = useState(null);

  const startForcePush = async () => {
    setForcePushMode(true);
    const branch = await resolveActiveBranch(repo);
    setProtectedBranchWarning(isProtectedBranchName(branch) ? branch : null);
  };
  const cancelForcePush = () => {
    setForcePushMode(false);
    setConfirmText('');
    setProtectedBranchWarning(null);
  };

  const confirmForcePush = async (onDone) => {
    setForcePushMode(false);
    setConfirmText('');
    setBusy(true);
    setBusyLabel('Force Push...');
    try {
      const branch = await resolveActiveBranch(repo);
      await forcePushRepo(repo.dir, branch, token);
      setBusy(false);
      appAlert('Force Push Berhasil', 'Riwayat commit di GitHub sudah ditimpa dengan riwayat lokal.');
      onDone?.();
    } catch (e) {
      setBusy(false);
      appAlert('Force Push Gagal', e.message);
    }
  };

  return {
    busy,
    busyLabel,
    doPush,
    doPull,
    forcePushMode,
    protectedBranchWarning,
    confirmText,
    setConfirmText,
    startForcePush,
    cancelForcePush,
    confirmForcePush,
  };
}
