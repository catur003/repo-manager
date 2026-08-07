# RepoManager App — Fase 0 (Fondasi)

Status: Fase 0 selesai. Login GitHub (Device Flow), penyimpanan token aman,
dan sistem log 3-lapis sudah jalan. Fase 1 (Repository Core: browse repo
GitHub, clone via isomorphic-git, dashboard) belum dimulai.

## Yang sudah ada

- `src/config.js` — Client ID GitHub OAuth App sudah diisi
- `src/auth/githubAuth.js` — OAuth Device Flow lengkap (request code, polling, ambil profil)
- `src/auth/authStore.js` — token & profil disimpan di `expo-secure-store` (Keychain/Keystore)
- `src/logging/logger.js` — 3 lapis log (activity/error/debug) + `redactSecrets()` wajib dipanggil di semua titik log
- `src/git/fsAdapter.js` — adapter filesystem untuk `isomorphic-git` (disiapkan untuk Fase 1, belum dipakai screen manapun)
- `src/screens/LoginScreen.js` — UI device flow (kode 6 digit + tombol salin + buka browser otomatis)
- `src/screens/HomeScreen.js` — placeholder setelah login, diganti Dashboard asli di Fase 1

## Menjalankan

Project ini pakai native module (`isomorphic-git`, `expo-secure-store`, dll),
jadi **tidak bisa** pakai Expo Go biasa — harus development build:

```bash
npm install
npx expo prebuild
npx expo run:android
```

Atau kalau mau pakai EAS Build (tanpa Android Studio lokal):

```bash
npm install -g eas-cli
eas build --profile development --platform android
```

## Test login

1. Jalankan app di device/emulator
2. Tap "Login dengan GitHub"
3. Browser kebuka otomatis ke halaman device code, atau salin kode & buka manual
4. Approve di GitHub
5. App otomatis lanjut ke Home setelah polling berhasil

## Cek keamanan manual (sebelum lanjut Fase 1)

```bash
# Setelah login & pakai app sebentar, cek tidak ada token plaintext di log:
adb shell run-as id.zen.repomanager cat files/logs/*.log | grep -i "gh[pousr]_"
# Harusnya kosong / tidak ada match
```

## Selanjutnya (Fase 1)

- Fetch daftar repo GitHub user (`GET /user/repos`)
- Clone via `isomorphic-git` ke `fsAdapter.REPOS_ROOT` (sudah disiapkan)
- Layar Local Repos (favorite, search, hapus)
- Dashboard status repo aktif + Compare Repository (ahead/behind/diverged)
