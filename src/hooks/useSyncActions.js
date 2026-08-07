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

/** Format daftar file berubah buat ditempel di pesan appAlert - dibatasi
 * (diffCommitFiles udah nge-cap + hitung sisa), biar gak kepanjangan. */
function formatChangedFiles(changedFiles) {
  if (!changedFiles || !changedFiles.total) return '';
  const list = changedFiles.files.join('\n');
  const more = changedFiles.remaining > 0 ? `\n... dan ${changedFiles.remaining} file lainnya` : '';
  return `\n\nFile berubah (${changedFiles.total}):\n${list}${more}`;
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
      const res = await pullRepo(repo.dir, repo.defaultBranch, token, author);
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
            ? `Perubahan lokal kamu sudah diterapkan balik. Cek dulu hasilnya (buka Working Tree) - kalau semua aman, hapus cadangan stash. Kalau ada yang aneh, buang hasil terapan dan stash-nya tetap tersimpan.${formatChangedFiles(res.changedFiles)}`
            : res.error,
          res.stashApplied
            ? [
                {
                  text: 'Ada Masalah, Buang Hasilnya',
                  style: 'cancel',
                  onPress: async () => {
                    await discardAppliedStash(repo.dir);
                    appAlert('Dibatalkan', 'Hasil terapan dibuang, kondisi kembali ke abis pull. Perubahan lokal kamu tetap aman tersimpan di stash, coba lagi nanti.');
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

      appAlert('Pull Berhasil', `Perubahan terbaru dari GitHub sudah digabung.${formatChangedFiles(res.changedFiles)}`);
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
      const res = await pushRepo(repo.dir, repo.defaultBranch, token);
      setBusy(false);
      if (res.rejected) {
        appAlert('Push ditolak', 'Ada perubahan baru di GitHub. Pull dulu, baru coba Push lagi?', [
          { text: 'Batal', style: 'cancel' },
          { text: 'Pull Sekarang', style: 'primary', onPress: () => doPull(onDone) },
        ]);
        return;
      }
      appAlert('Push Berhasil', `Repository: ${repo.fullName}\nBranch: ${repo.defaultBranch}${formatChangedFiles(res.changedFiles)}`);
      onDone?.();
    } catch (e) {
      setBusy(false);
      appAlert('Push Gagal', e.message);
    }
  };

  const startForcePush = () => setForcePushMode(true);
  const cancelForcePush = () => {
    setForcePushMode(false);
    setConfirmText('');
  };

  const confirmForcePush = async (onDone) => {
    setForcePushMode(false);
    setConfirmText('');
    setBusy(true);
    setBusyLabel('Force Push...');
    try {
      await forcePushRepo(repo.dir, repo.defaultBranch, token);
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
    confirmText,
    setConfirmText,
    startForcePush,
    cancelForcePush,
    confirmForcePush,
  };
}
