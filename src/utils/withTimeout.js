/**
 * withTimeout.js
 * Pembungkus kecil: kalau `promise` gak selesai dalam `ms`, dianggap
 * timeout (reject dengan pesan jelas) - dipakai buat jaga-jaga di
 * layar yang sempat "loading terus kayak crash" (laporan Zen), biar ada
 * batas waktu yang jelas dan errornya kelihatan, bukan nyangkut diam.
 */
export function withTimeout(promise, ms, label = 'Operasi') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (lebih dari ${Math.round(ms / 1000)} detik) - coba lagi.`)), ms)),
  ]);
}
