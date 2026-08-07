/**
 * format.js
 * Helper format kecil yang dipakai lintas layar. Baru berisi formatSize
 * untuk sekarang - kalau nanti butuh formatter lain (tanggal, dsb),
 * tambahkan di sini supaya tidak ada logic format yang disalin-tempel
 * per-layar (sama semangatnya dengan friendlyError.js - satu titik).
 *
 * BUGFIX (7 Agustus 2026): sebelumnya ukuran repo selalu ditampilkan
 * `Math.round(sizeKb / 1024)` + "MB" langsung di RepoListScreen. Untuk
 * repo kecil (mis. 200KB) itu jadi "0MB" - kelihatan seperti data hilang,
 * padahal cuma pembulatan. Fix: tampilkan KB kalau di bawah 1MB.
 */

export function formatSize(kb) {
  const n = Number(kb) || 0;
  if (n <= 0) return '0 KB';
  if (n < 1024) return `${Math.round(n)} KB`;
  return `${(n / 1024).toFixed(1)} MB`;
}
