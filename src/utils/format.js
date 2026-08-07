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

/** Format "X menit/jam/hari lalu" dari timestamp ms. Dipindah kesini dari
 * LocalReposScreen.js supaya StorageManagerScreen bisa pakai juga tanpa
 * duplikasi (Fitur Storage Manager, keputusan 10.1). */
export function timeAgo(ts) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}

/** Format "YYYY-MM-DD HH:mm:ss" - persis format now_str() di CLI asli
 * (dashboard.py), dipakai panel status Dashboard. */
export function formatDateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
