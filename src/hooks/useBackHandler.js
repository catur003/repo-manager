/**
 * useBackHandler.js
 * BUGFIX (7 Agustus 2026, laporan Zen): tombol/gesture back Android
 * langsung nge-exit app - router custom app ini (App.js pakai state,
 * bukan react-navigation) dari awal gak pernah "dengerin" hardware back
 * sama sekali, jadi jatuh ke perilaku default OS (keluar app).
 *
 * RN's BackHandler API secara native udah dukung banyak listener
 * ditumpuk (LIFO - yang terakhir daftar duluan yang dicek). Kalau
 * handler balikin `true`, event dianggap "sudah ditangani", berhenti di
 * situ - gak lanjut ke listener yang lebih luar (gak sampai nge-exit
 * app). Kalau `false`, diteruskan ke listener berikutnya (atau default
 * OS kalau sudah paling luar).
 *
 * Dipakai berlapis: layar dengan mode internal (Branch/Upload/Working
 * Tree) daftar handler sendiri (balikin true = mundur satu langkah di
 * dalam layar itu, false = biarin ditutup total). App.js sendiri daftar
 * handler paling dasar (nutup overlay yang lagi kebuka).
 */

import { useEffect } from 'react';
import { BackHandler } from 'react-native';

export function useBackHandler(handler, deps = []) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
