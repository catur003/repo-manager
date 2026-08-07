/**
 * friendlyError.js
 * Satu titik pemetaan error mentah -> pesan manusia, persis tabel di
 * dokumen konsep Bagian 5.2. Dipakai di semua modul Fase 1+ (reposApi,
 * cloneRepo, compareRepository, dst) supaya aturan kerja #2 ("error tidak
 * pernah ditampilkan mentah") konsisten satu implementasi, bukan
 * disalin-tempel tiap modul (yang gampang mendivergen jadi bug/tidak
 * konsisten).
 *
 * Tidak pernah mengembalikan pesan yang mengandung token/URL asli - kalau
 * ragu, pesan generik dipilih. Detail teknis tetap dicatat lewat
 * logError() oleh si pemanggil (bukan tanggung jawab fungsi ini),
 * konsisten dengan pemisahan Activity Log vs Error Log di Bagian 5.1.
 */

export function toFriendlyMessage(e) {
  const raw = String(e && (e.message || e)).toLowerCase();

  if (raw.includes('network request failed') || raw.includes('fetch failed') || raw.includes('failed to fetch')) {
    return 'Tidak dapat terhubung ke internet. Periksa koneksi kamu.';
  }
  if (raw.includes('401') || raw.includes('bad credentials') || raw.includes('unauthorized')) {
    return 'Sesi login kadaluarsa. Silakan login ulang.';
  }
  if (raw.includes('403') && raw.includes('rate limit')) {
    return 'Terlalu banyak permintaan ke GitHub. Coba lagi dalam beberapa menit.';
  }
  if (raw.includes('403') && raw.includes('sso')) {
    return 'Repo ini perlu otorisasi tambahan dari admin organisasi kamu (SSO/SAML). Hubungi admin organisasi terkait.';
  }
  // PENTING: dulu ini cuma cek raw.includes('rejected') sendirian - kata
  // "rejected" ternyata juga muncul di error lain yang TIDAK ADA
  // hubungannya dengan push (mis. wrapper "Unhandled Promise Rejection"
  // dari error tak terduga lain saat clone). Akibatnya clone yang gagal
  // karena sebab lain malah nampilin pesan "Push ditolak..." yang
  // membingungkan. Sekarang wajib ada konteks "push" atau memang istilah
  // git yang unik ('non-fast-forward') sebelum dianggap kasus ini.
  if (raw.includes('non-fast-forward') || (raw.includes('push') && raw.includes('reject'))) {
    return 'Push ditolak — ada perubahan baru di GitHub. Pull dulu?';
  }
  if (raw.includes('merge conflict') || raw.includes('conflict')) {
    return 'Ada bagian file yang bentrok. Batalkan atau selesaikan manual?';
  }
  if (raw.includes('enospc') || raw.includes('disk full') || raw.includes('no space')) {
    return 'Penyimpanan HP penuh. Kosongkan ruang lalu coba lagi.';
  }
  if (raw.includes('enoent') && raw.includes('exist')) {
    return 'Repo lokal tidak ditemukan. Mungkin sudah dihapus dari luar app.';
  }
  return 'Terjadi kesalahan tak terduga. Detail sudah dicatat.';
}
