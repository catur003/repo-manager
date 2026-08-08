/**
 * heavyFolders.js
 * Daftar nama folder dependency/build-output yang HAMPIR SELALU tidak
 * dimaksudkan buat ke-track git (node_modules dkk) - biasanya berisi
 * ribuan file kecil.
 *
 * Dipakai di DUA tempat:
 *  1. statusCache.js - sebagai `filter` buat git.statusMatrix(), supaya
 *     folder-folder ini di-SKIP TOTAL (isomorphic-git gak turun/stat
 *     satu-satu ke dalamnya sama sekali), bukan di-scan lalu disaring
 *     belakangan. Lihat catatan performa di statusCache.js.
 *  2. workingTree.js - checkGitignoreRisk(), buat warning "folder ini
 *     belum ke-cover .gitignore" sebelum user nge-Add.
 *
 * CATATAN/TRADEOFF (8 Agustus 2026, laporan Zen "dashboard loading
 * terus"): karena filter di statusCache.js skip folder ini TANPA cek
 * dulu apakah isinya kebetulan sudah ke-track di git, kasus langka "user
 * SENGAJA commit node_modules" (praktik yang memang gak disarankan, app
 * ini juga sudah warning soal itu) bakal bikin perubahan di dalam folder
 * itu gak kelihatan di Working Tree/Dashboard sampai nama foldernya
 * dikeluarkan dari daftar ini. Trade-off ini disengaja demi performa -
 * skenario commit node_modules dianggap kasus langka & tidak disarankan.
 */
export const HEAVY_FOLDERS = ['node_modules', '.expo', 'dist', 'build', '__pycache__', 'venv', '.next', '.venv'];

const HEAVY_FOLDER_SET = new Set(HEAVY_FOLDERS);

/** Predicate buat git.statusMatrix({ filter }) - return false = skip path
 * ini (dan kalau ini folder, isomorphic-git gak turun ke dalamnya). */
export function skipHeavyFolders(filepath) {
  const segments = filepath.split('/');
  for (const seg of segments) {
    if (HEAVY_FOLDER_SET.has(seg)) return false;
  }
  return true;
}
