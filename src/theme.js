/**
 * theme.js
 * Design tokens pusat. SEMUA warna dipakai lewat COLORS.xxx - tidak ada
 * hex hardcode di komponen/layar manapun, supaya kalau nanti mau nambah
 * toggle tema (lihat konsep Bagian 10.11, "opsi tema jadi dokumen UI/UX
 * terpisah nanti"), tinggal ganti isi file ini tanpa menyentuh layar.
 *
 * Palet ini di-porting dari tema "ocean" milik app zenvps (portofolio Zen
 * yang sudah ada) - sky-blue & cyan, terang, clean - persis yang diminta
 * keputusan 10.11 ("clean, tema sky-blue, konsisten dengan tema portofolio
 * Zen yang sudah ada"). Struktur token (nama-nama key) juga disamakan
 * dengan lib/theme.ts & lib/themes.ts di zenvps supaya kalau kelak app ini
 * mau ikut dukung multi-tema, tinggal contek pola registry-nya di sana.
 */

export const COLORS = {
  bg: '#EEF6FB',
  card: 'rgba(255,255,255,0.92)',
  cardBorder: 'rgba(255,255,255,0.95)',

  ink: '#132530',
  inkMuted: '#4E7385',
  inkFaint: '#8DAAB8',

  accent: '#0EA5E9',
  accentAlt: '#06B6D4',
  accentSoft: 'rgba(14,165,233,0.12)',
  accentAltSoft: 'rgba(6,182,212,0.12)',
  // Warna teks/icon DI ATAS permukaan ber-background `accent` (tombol
  // primary, banner). Dulu ini yang salah dipasang di variant "secondary"
  // (background terang) sehingga teks jadi putih-di-atas-putih - lihat
  // catatan perbaikan di components/UI.js.
  onAccent: '#FFFFFF',

  green: '#16A34A',
  greenSoft: 'rgba(34,197,94,0.12)',
  amber: '#D97706',
  amberSoft: 'rgba(245,158,11,0.12)',
  blue: '#2563EB',
  blueSoft: 'rgba(59,130,246,0.12)',
  red: '#DC2626',
  redSoft: 'rgba(239,68,68,0.12)',

  divider: '#DCEAF2',

  // Warna blob latar Aurora - persis palet "ocean" zenvps.
  auroraColors: ['#0EA5E9', '#06B6D4', '#2FB4C9', '#39C9B0'],
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
