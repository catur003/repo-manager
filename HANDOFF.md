# HANDOFF — RepoManager App (porting GitHub Manager Termux CLI ke React Native)

Dibuat: 7 Agustus 2026, oleh Claude (sesi sebelumnya kehabisan limit).
Tujuan dokumen: supaya AI/sesi berikutnya bisa lanjut kerja tanpa perlu baca ulang
seluruh histori chat.

## 1. Dokumen rujukan (WAJIB dibaca duluan)

- `konsepgithubmanagermobile.pdf` — dokumen konsep utama. Berisi arsitektur,
  10 keputusan Zen di Bagian 10 (baca ini dulu, banyak keputusan penting di
  situ — nama app, bahasa, tema, SSH/LFS pending, dst), dan rencana 9 fase.
- `CHANGELOG-fase0-fix-dan-fase1.md` — changelog resmi project (Fase 0 + awal
  Fase 1). **Belum di-update** dari sesi ini (lihat Bagian 6 di bawah, itu PR
  buat sesi berikutnya — file project aslinya read-only dari sisi Claude,
  jadi update-nya perlu ditulis manual oleh Zen atau AI berikutnya lewat akses
  filesystem asli, bukan lewat container Claude).
- `github-manager-master.zip` (source asli CLI Python, 15 modul) — SELALU cek
  file `.py` yang relevan sebelum porting fitur baru. Jangan asal desain dari
  nol; port logic-nya, sesuaikan cuma yang benar-benar perlu (dijelaskan di
  komentar kode kalau ada penyesuaian).

## 2. Status Fase (per 7 Agustus 2026)

| Fase | Status | Catatan |
|---|---|---|
| 0 — Fondasi | Selesai | Login Device Flow, SecureStore, log 3-lapis, metro.config.js |
| 1 — Repository Core | Selesai (lebih lengkap dari rencana) | + Storage Manager, Dashboard status panel gaya CLI |
| 2 — Branch | **Belum mulai** | ~361 baris CLI (branch.py) — scope kecil-sedang |
| 3 — Working Tree & Commit | **Belum mulai, DISKUSI TERAKHIR di sini** | Lihat Bagian 5 — next step yang direncanakan |
| 4 — Sync (Push/Pull) | Belum mulai | Sengaja dipisah dari Fase 3 (total gabungan 713 baris CLI, gak kecil) |
| 5 — Merge & PR | Belum mulai | |
| 6 — Upload | **Selesai** (3 dari 4 aksi CLI; Upload Folder sengaja skip, lihat UploadScreen.js) | |
| 7 — Backup | Belum mulai | `expo-sharing` sudah ditambah ke package.json buat ini |
| 8 — Settings/Log/Belajar Git | Sebagian (fondasi minimal) | Log viewer masih versi sementara di SettingsScreen.js |
| 9 — Hardening & Rilis | Belum mulai | |

## 3. Struktur kode saat ini

```
app/
  App.js                      — root, routing manual (bukan react-navigation, lihat Bagian 7)
  metro.config.js             — WAJIB, fix resolusi isomorphic-git (lihat Bagian 4)
  package.json                — lihat Bagian 7 soal dependency yang "nganggur"
  src/
    auth/                     — OAuth Device Flow (Fase 0, jangan diubah tanpa alasan kuat)
    logging/logger.js         — 3-lapis log (activity/error/debug), redactSecrets() WAJIB dipanggil semua log
    git/
      fsAdapter.js            — adapter fs custom buat isomorphic-git (REPOS_ROOT, mkdirRecursive - export, reusable)
      cloneRepo.js            — Fase 1
      compareRepository.js    — compareRepository() (fetch+compare) & getLocalAheadBehind() (offline, no fetch)
      friendlyError.js        — SATU tempat mapping error mentah -> pesan manusia
      localRepos.js           — metadata repo lokal (JSON di sandbox)
      diskUsage.js            — Storage Manager
      repoStatus.js           — panel status Dashboard gaya CLI dashboard.py
      reposApi.js             — GitHub REST API (list repo)
      zipCore.js              — LOGIC MURNI (gak nyentuh FS): safeZipMemberPath, detectZipRoot
      uploadRepo.js            — FS operations Upload (pakai zipCore.js + jszip + expo-crypto)
    screens/                  — satu file per layar, semua sudah pakai komponen UI.js standar
    components/
      UI.js                   — Button, Card, ErrorBanner, InfoBanner, SectionTitle, PillRow, Tile, HeroCard, StatusTable, StatusBadge
      TabBar.js                — custom, pakai Feather icon
      AuroraBackground.js     — background blob, dari zenvps
    utils/format.js           — formatSize, timeAgo, formatDateTime
    theme.js                  — SEMUA warna lewat COLORS.xxx, jangan hardcode hex di layar
```

## 4. Bug-bug yang sudah diperbaiki (biar gak keulang)

1. **isomorphic-git `crypto` error** — Metro (Expo SDK 51) gak baca `package.json#exports`
   isomorphic-git secara default, jatuh ke `index.cjs` (Node-only, `require('crypto')`).
   Fix: `metro.config.js` set `resolver.unstable_enablePackageExports = true`.
2. **`fsAdapter.js` mkdir bug** — dulu `{intermediates:false}`, gagal bikin folder
   bersarang (`.git/refs/remotes/origin/`) → clone gagal ENOENT. Fix: `mkdirRecursive()`
   (intermediates:true + defensive check karena expo-file-system kadang lempar
   error palsu meski folder sukses dibuat). Dipakai juga di `writeFile()` sebagai
   lapis pengaman kalau isomorphic-git skip mkdir.
3. **`friendlyError.js` salah label "Push ditolak"** — dulu cuma cek substring
   `'rejected'`, padahal itu muncul juga di pesan generik RN
   (`"Call to function 'X' has been rejected"` — bridge error, bukan git).
   Fix: wajib ada kata `'push'` juga sebelum dianggap kasus itu.
4. **Safe area / navbar mepet atas** — gak ada `SafeAreaProvider` sama sekali.
   Fix: dibungkus di `App.js`, insets dipakai buat padding top root + padding
   bottom TabBar.
5. **RepoListScreen full-row tap** — `onPress` dulu nempel di `<Text>` doang.
   Sekarang wrapped di `PillRow`/`Pressable` penuh.
6. **Size format** — `formatSize()` di `utils/format.js`, nunjukin KB kalau <1MB.

## 5. RENCANA YANG SEDANG DIDISKUSIKAN (belum dikerjakan — INI PRIORITAS BERIKUTNYA)

Zen minta lanjut **Fase 3 (Working Tree: Git Add + Commit)** dulu, TERPISAH dari
Fase 4 (Push/Pull) — sudah dicek baris CLI-nya: gitadd.py(200)+commit.py(151) vs
push.py(159)+pull.py(203), totalnya 713 baris kalau digabung semua, jadi sengaja
dipecah jadi 2 fase, bukan digabung.

**Yang disepakati masuk Fase 3:**
- Git Status lengkap (Modified/Added/Deleted/Untracked) — reuse `getWorkingTreeStatus()`
  yang sudah ada di `compareRepository.js`, tapi perlu detail per-file (bukan cuma
  clean/modified) via `git.statusMatrix()`.
- Add Semua / Add Terpilih (checkbox per file) / Unstage.
- Buat Commit (guard: harus ada staged file, pesan gak boleh kosong — CLI punya
  guard ini persis, WAJIB dipertahankan).
- Riwayat Commit, Amend Commit.
- **FITUR BARU (bukan dari CLI, request Zen)**: sebelum Add, cek folder berat
  umum (`node_modules`, `.expo`, `dist`, `build`, `__pycache__`, `venv`, `.next`)
  ada di repo tapi gak ke-cover `.gitignore` (atau `.gitignore` gak ada sama
  sekali) → tampilkan warning sebelum lanjut nge-add (bukan blokir total, cuma
  peringatan, biar user gak gak sengaja commit folder segede itu).

**Penjelasan yang perlu diingat (biar gak nanya ulang ke Zen):**
Zen sempat bingung kenapa Dashboard nunjukin "71 file berubah" tapi
"Ahead/Behind" tetap 0/0. Itu **bukan bug** — "file berubah" = working tree
(belum di-commit), "Ahead/Behind" = beda commit vs remote. Commit belum ada,
jadi ahead gak mungkin naik. Sudah dijelasin ke Zen dan dia paham, cukup
diteruskan kalau muncul pertanyaan serupa dari sisi lain.

Setelah Fase 3 selesai, lanjut **Fase 4 (Push/Pull)** sebagai fase terpisah.

## 6. PR buat CHANGELOG project (belum ditulis ke file asli)

`CHANGELOG-fase0-fix-dan-fase1.md` di project perlu entry baru buat semua yang
dikerjakan sesi ini (Fase 1 lanjutan + Fase 6 Upload + serangkaian bugfix).
Ringkasan yang perlu masuk (bisa disalin manual atau AI berikutnya yang tulis):

- Fix metro.config.js (isomorphic-git crypto)
- Fix fsAdapter mkdir (clone ENOENT)
- Fix friendlyError push-rejected false positive
- Safe area / navbar
- UI konsisten gaya zenvps (HeroCard, PillRow, Tile, StatusTable, InfoBanner)
- Icon Feather (@expo/vector-icons) — bukan emoji, keputusan eksplisit Zen
- Dashboard: panel status detail gaya CLI dashboard.py + grid 13 menu (peta ke
  15 menu CLI asli, 2 di antaranya - Cek Update & Log Debug - digabung/dihapus)
- Storage Manager (keputusan 10.1 dokumen konsep) — baru dibangun sesi ini
- Fase 6 Upload (Upload File, ZIP Extract, ZIP No Extract) — Upload Folder
  sengaja skip
- SettingsScreen: log viewer sementara (Fase 8 versi awal)

## 7. Dependency — status "sudah ditambah tapi belum dipakai"

Ini PENTING biar AI berikutnya gak bingung kenapa ada dependency nganggur:

| Dependency | Status pemakaian | Buat apa nanti |
|---|---|---|
| `expo-sharing` | **Belum dipakai di kode manapun** | Fase 7 (export Backup) + Fase 8 (export Debug Log via share, bukan cuma clipboard) |
| `@react-navigation/native` + `native-stack` + `react-native-screens` + `react-native-gesture-handler` | **Belum dipakai** | Cadangan kalau nanti `App.js` custom routing (lihat komentar di TabBar.js) dirasa gak cukup. BUKAN keputusan pasti — cuma jaga-jaga karena kebetulan lagi rebuild buat alasan lain, jangan buru-buru migrasi ke react-navigation tanpa alasan kuat |
| `@expo/vector-icons` | **Sudah dipakai** (TabBar, Tile, PillRow, dll — Feather icon set) | - |
| `expo-document-picker` | **Sudah dipakai** (UploadScreen.js) | - |
| `jszip` | **Sudah dipakai** (uploadRepo.js) — bisa juga generate ZIP (buat Backup nanti) | - |

**Kalau nambah fitur baru yang butuh dependency native baru** (native module,
BUKAN pure-JS kayak jszip), selalu kasih tau Zen jelas: nama dependency, apa
fungsinya, dan bahwa itu butuh `npx expo prebuild` + build ulang dev client
(gak cukup `expo start -c`). Kalau ada beberapa fitur beda-beda yang sama-sama
butuh native dependency, LEBIH BAIK tawarkan gabung jadi satu rebuild
(persis yang kejadian sesi ini: document-picker + vector-icons digabung).

## 8. Gotcha teknis penting

1. **JANGAN percaya `node --check` buat validasi syntax file yang mulai
   dengan `import`** — ini bug yang kejadian sesi ini dan buang kuota build
   Zen. `node --check` diam-diam SUKSES (exit 0) meski ada syntax error asli
   (contoh kejadian: `await` di luar `async function`) kalau baris pertama
   file itu `import ...`. Cara validasi yang BENAR (sudah dites, reliable):

   ```bash
   # tsc TERSEDIA GLOBAL di environment container Claude:
   # /home/claude/.npm-global/bin/tsc
   mkdir -p /tmp/tscheck && cp -r src /tmp/tscheck/src && cp App.js /tmp/tscheck/App.js
   cd /tmp/tscheck && find . -name "*.js" | while read f; do mv "$f" "${f%.js}.jsx"; done
   find . -name "*.jsx" > filelist.txt
   /home/claude/.npm-global/bin/tsc --noEmit --allowJs --jsx react-native \
     --target esnext --module esnext --skipLibCheck --noResolve \
     --ignoreDeprecations 6.0 $(cat filelist.txt) 2>&1 | grep -E "error TS1[0-9]{3}"
   ```
   Filter `TS1[0-9]{3}` = syntax error asli. Kode lain (TS2xxx dst) itu cuma
   noise semantic/type (wajar muncul karena `--noResolve` + gak ada type defs
   React Native, abaikan). Kalau grep di atas kosong, file aman secara sintaks.
   **WAJIB jalanin ini sebelum kirim file/zip ke Zen, jangan andalkan
   `node --check` lagi.**

2. **isomorphic-git di RN butuh `metro.config.js` dengan
   `unstable_enablePackageExports: true`** — jangan dihapus.

3. **`fsAdapter.js` punya sandbox path convention**: isomorphic-git `dir`
   param pakai gaya `/nama_repo` (leading slash, tanpa REPOS_ROOT). Kalau
   butuh path filesystem ASLI (buat `expo-file-system` langsung, di luar
   isomorphic-git), harus manual gabung: `` `${REPOS_ROOT}${dir.replace(/^\/+/,'')}` ``
   (lihat contoh di `repoStatus.js`, `StorageManagerScreen.js`, `uploadRepo.js`
   via `UploadScreen.js`'s `repoRealDir()`).

4. **Ahead/Behind dihitung OFFLINE by default** (`getLocalAheadBehind()` di
   `compareRepository.js`) di semua tempat KECUALI `CompareScreen.js` (yang
   fetch dulu). Ini keputusan sengaja (hindari nembak GitHub API buat tiap
   repo di list) — JANGAN diubah jadi selalu fetch tanpa didiskusikan dulu,
   bisa kena rate limit kalau repo banyak.

5. **TIDAK ADA icon/emoji piktogram kasual** di project ini (keputusan Zen
   7 Agustus 2026) — yang boleh cuma vector icon dari `@expo/vector-icons`
   (Feather set), dipakai konsisten lewat prop `icon` di `PillRow`/`Tile`
   atau langsung `<Feather name="..." />`. Jangan taruh emoji di teks/label
   manapun.

## 9. Keputusan Zen yang masih berlaku (dari dokumen konsep Bagian 10, ringkasan)

- Nama app kemungkinan besar gak boleh pakai kata "GitHub" (trademark) —
  belum final, perlu dicek sebelum submit store.
- Bahasa: Indonesia + Inggris (i18n dari awal, belum diimplementasi kodenya).
- Tema: sky-blue flat, belum ada dark mode (sengaja, dokumen UI/UX terpisah
  nanti kalau mau ditambah).
- SSH key auth & Git LFS: sama-sama "pending update berikutnya", BELUM masuk
  rencana fase manapun secara konkret.
- Platform fokus: Android dulu (Play Store), iOS belum direncanakan.

## 10. Cara build & jalanin (ringkasan buat AI baru)

```bash
npm install
npx expo prebuild
npx expo run:android
# atau tanpa Android Studio lokal:
# eas build --profile development --platform android
```
Setelah dev client ke-install sekali, perubahan JS-only (gak nambah native
dependency) cukup `npx expo start -c`. Perubahan yang nambah native
dependency (lihat Bagian 7) WAJIB prebuild + build ulang.
