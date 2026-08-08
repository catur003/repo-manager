/**
 * statusCache.js
 * Cache in-memory buat git.statusMatrix() - itu operasi PALING berat
 * (scan tiap file di working dir lewat bridge JS-Native, lihat diskusi
 * performa 7 Agustus 2026). Prioritas STABILITAS di atas kecepatan
 * (permintaan Zen) - makanya desainnya:
 *
 *  - Cuma di memori (bukan disk) - app restart = otomatis reset, gak ada
 *    cache basi yang nyangkut lintas sesi.
 *  - Arah bahaya cache SATU SISI: kalau cache bilang "bersih" padahal
 *    "berubah" itu bahaya (bisa bikin Pull nimpa data). Makanya semua
 *    fungsi yang NULIS ke working dir/index WAJIB manggil
 *    invalidateStatusCache() - lihat daftar lengkap tempatnya di
 *    komentar masing-masing fungsi yang manggil.
 *  - TTL 15 detik sebagai pengaman kedua - walau lupa invalidate di satu
 *    tempat (bug manusia), cache maksimal basi 15 detik, bukan selamanya.
 *  - FETCH DAN PUSH TIDAK MENGINVALIDATE - keduanya gak nyentuh working
 *    directory/index sama sekali (Fetch cuma update refs/remotes/*,
 *    Push cuma kirim data keluar), jadi status lokal beneran gak berubah
 *    - ini yang dimaksud "gak ganggu fetch" di permintaan Zen.
 */

import git from 'isomorphic-git';
import { fs } from './fsAdapter';
import { skipHeavyFolders } from './heavyFolders';

const TTL_MS = 15000;
const cache = new Map(); // dir -> { rows, ts }

// PERF (8 Agustus 2026, laporan Zen "dashboard loading terus, batesnya
// 15 detik keburu abis"): akar masalahnya BUKAN cuma "isomorphic-git
// lambat" secara umum - statusMatrix() emang lambat KHUSUSNYA kalau
// working dir ada folder kayak node_modules yang isinya ribuan file
// kecil, karena tiap file butuh trip async lewat expo-file-system bridge
// buat di-stat satu-satu. Sebelum ini, statusMatrix() nyisir SEMUA file
// termasuk yang di dalam node_modules dkk, walau app-nya sendiri sudah
// punya warning "jangan sampai node_modules ke-commit" (lihat
// checkGitignoreRisk di workingTree.js) - jadi folder yang jelas gak
// dimaksud buat ditrack tetap ikut di-scan penuh, sia-sia.
//
// Sekarang dikasih `filter` (skipHeavyFolders, lihat heavyFolders.js) -
// isomorphic-git SAMA SEKALI GAK TURUN ke folder-folder itu, bukan
// discan-lalu-dibuang. Buat repo JS/RN/Python biasa (node_modules bisa
// puluhan ribu file), ini yang bikin beda dari "nyangkut 15 detik" jadi
// hitungan detik. Lihat heavyFolders.js buat trade-off-nya.
export async function getStatusMatrixCached(dir) {
  const entry = cache.get(dir);
  if (entry && Date.now() - entry.ts < TTL_MS) {
    return entry.rows;
  }
  const rows = await git.statusMatrix({ fs, dir, filter: skipHeavyFolders });
  cache.set(dir, { rows, ts: Date.now() });
  return rows;
}

/** Dipanggil setelah operasi apa pun yang nulis ke working dir/index:
 * Add/Unstage/Commit/Amend (workingTree.js), Upload extract/copy
 * (uploadRepo.js), Pull + stash push/apply/discard (syncRepo.js). */
export function invalidateStatusCache(dir) {
  cache.delete(dir);
}
