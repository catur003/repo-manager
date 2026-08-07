/**
 * zipCore.js
 * Logic murni (gak nyentuh filesystem) - port langsung dari 2 fungsi
 * paling kritis di CLI asli:
 *   - safe_zip_member_path() di utils.py (Bagian 6.2 dokumen konsep -
 *     WAJIB dipakai semua ekstraksi ZIP, jangan pernah join path manual)
 *   - _detect_zip_root() di upload.py (deteksi folder wrapper struktural,
 *     BUKAN cari file marker di sembarang kedalaman - itu sengaja diubah
 *     di CLI asli karena versi lama bisa salah tebak, lihat komentar
 *     panjang di source Python-nya)
 *
 * Dipisah dari uploadRepo.js (yang nyentuh expo-file-system) supaya logic
 * inti ini gampang dites/diverifikasi terpisah dari efek samping I/O.
 */

/**
 * Zip Slip protection. `destDirUri` itu URI folder tujuan (sudah absolut),
 * `memberRelPath` itu path relatif dari dalam ZIP (gaya CLI: udah dipotong
 * root_prefix-nya duluan oleh caller). Entry yang isinya '../' berlebih
 * (mencoba keluar dari destDirUri) ditolak -> return null.
 *
 * CLI asli pakai os.path.realpath() (butuh filesystem beneran, ada
 * symlink dsb). Di sini gak ada symlink di sandbox app (lihat catatan di
 * fsAdapter.js), jadi cukup resolve '..'/'.' murni via stack tanpa nyentuh
 * disk - hasilnya setara secara keamanan untuk environment ini.
 */
export function safeZipMemberPath(destDirUri, memberRelPath) {
  const cleaned = String(memberRelPath).replace(/\0/g, ''); // buang null byte
  const parts = cleaned.split('/').filter((p) => p !== '' && p !== '.');
  const stack = [];
  for (const part of parts) {
    if (part === '..') {
      if (stack.length === 0) return null; // coba keluar dari destDir -> tolak
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  if (stack.length === 0) return null; // entry cuma nunjuk ke destDir sendiri
  const base = destDirUri.replace(/\/+$/, '');
  return `${base}/${stack.join('/')}`;
}

// Marker file buat disambiguasi kandidat root kalau ada >1 folder sejajar
// tanpa file penyeimbang. CLI asli pakai marker khusus proyek Python-nya
// sendiri (github-manager.py, requirements.txt) - diganti di sini dengan
// marker yang lebih umum berlaku untuk project apapun (bukan cuma Python),
// karena app ini nerima upload dari repo GitHub jenis apa saja.
const ROOT_MARKERS = ['package.json', 'README.md', 'index.js', 'app.json', '.gitignore'];

/**
 * Deteksi folder wrapper di dalam ZIP - port 1:1 dari algoritma
 * _detect_zip_root() CLI asli: turun satu level SELAMA level itu cuma
 * berisi 1 folder tunggal tanpa file sejajar, berhenti begitu ketemu file
 * atau >1 folder.
 *
 * `entryNames`: semua nama entry di ZIP (gaya JSZip - folder eksplisit
 * diakhiri '/', file tidak).
 *
 * Return salah satu:
 *   { prefix: "" }              -> 0 wrapper
 *   { prefix: "a/b/" }          -> wrapper (mungkin berantai) yang harus dihapus
 *   { ambiguous: "prefix", candidates: [...] } -> gak bisa ditentukan
 *   otomatis (kecuali marker cocok cuma di 1 folder, itu sudah ditangani
 *   di dalam fungsi ini juga - baru balikin ambiguous kalau bener2 gak
 *   bisa diputusin).
 */
export function detectZipRoot(entryNames) {
  function entriesAt(prefix) {
    const dirs = new Set();
    const files = [];
    for (const name of entryNames) {
      if (prefix && !name.startsWith(prefix)) continue;
      const rel = name.slice(prefix.length);
      if (!rel) continue;
      const parts = rel.split('/');
      if (parts.length > 1) {
        if (parts[0]) dirs.add(parts[0]);
      } else if (!rel.endsWith('/') && parts[0]) {
        files.push(parts[0]);
      }
    }
    return { dirs, files };
  }

  let prefix = '';
  // Batas jaga-jaga supaya gak infinite loop kalau ada struktur ZIP aneh
  // (CLI asli gak punya batas eksplisit karena Python rekursi/loop-nya
  // beda karakteristik, tapi ini pengaman murah yang gak mengubah hasil
  // buat kasus normal).
  for (let depth = 0; depth < 64; depth++) {
    const { dirs, files } = entriesAt(prefix);

    if (dirs.size === 0 && files.length === 0) {
      return { prefix };
    }

    if (files.length > 0 || dirs.size > 1) {
      if (dirs.size > 1 && files.length === 0) {
        const candidates = [];
        for (const d of [...dirs].sort()) {
          const { files: subFiles } = entriesAt(prefix + d + '/');
          if (subFiles.some((f) => ROOT_MARKERS.includes(f))) candidates.push(d);
        }
        if (candidates.length === 1) {
          return { prefix: prefix + candidates[0] + '/' };
        }
        return { ambiguous: prefix, candidates: [...dirs].sort() };
      }
      return { prefix };
    }

    const onlyDir = [...dirs][0];
    prefix = prefix + onlyDir + '/';
  }
  return { prefix }; // fallback kalau somehow kena batas depth
}
