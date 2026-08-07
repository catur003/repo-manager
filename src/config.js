// Konfigurasi global app. Tidak ada secret di sini - Client ID OAuth
// bukan rahasia (beda dari Client Secret, yang memang tidak dipakai
// sama sekali di alur Device Flow).

export const GITHUB_CLIENT_ID = 'Ov23li6XP47UGdkGJ3FB';

// Scope minimal yang dibutuhkan: akses repo (baca/tulis) + baca profil user
// (untuk isi nama/email default commit). Tidak minta scope admin/org apa pun.
export const GITHUB_SCOPES = 'repo read:user';

export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// Nama kerja sementara - lihat dokumen konsep Bagian 10.6 soal nama final
// (kemungkinan tidak bisa memakai kata "GitHub" di branding publik).
export const APP_NAME_WORKING = 'RepoManager';
