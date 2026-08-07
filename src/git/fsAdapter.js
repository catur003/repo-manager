/**
 * fsAdapter.js
 * Adapter filesystem custom supaya isomorphic-git bisa jalan di React
 * Native lewat expo-file-system, sesuai rencana Fase 1 (clone/commit/push
 * beneran offline ke storage sandbox HP - lihat dokumen konsep Bagian 2).
 *
 * isomorphic-git butuh objek 'fs' dengan sebagian method mirip Node
 * fs.promises. Method di sini SENGAJA minimal (readFile, writeFile,
 * unlink, readdir, mkdir, rmdir, stat, lstat, rename) - cukup buat
 * operasi git dasar, tanpa symlink (jarang relevan di repo mobile).
 *
 * CATATAN: file ini belum dipakai modul manapun di Fase 0 (auth-only).
 * Baru dipakai mulai Fase 1 saat fitur Clone dibangun. Disiapkan dari
 * awal supaya Fase 1 tidak mulai dari nol.
 */

import * as FileSystem from 'expo-file-system';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

export const REPOS_ROOT = `${FileSystem.documentDirectory}repos/`;

function toUri(path) {
  // isomorphic-git kasih path absolut gaya posix (mis. "/ZenStock/README.md").
  // Kita treat root '/' sebagai REPOS_ROOT.
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${REPOS_ROOT}${clean}`;
}

async function statLike(path) {
  const uri = toUri(path);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    const err = new Error(`ENOENT: no such file or directory, stat '${path}'`);
    err.code = 'ENOENT';
    throw err;
  }
  const isDir = !!info.isDirectory;
  return {
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isSymbolicLink: () => false,
    size: info.size || 0,
    mtimeMs: (info.modificationTime || 0) * 1000,
    ctimeMs: (info.modificationTime || 0) * 1000,
    // isomorphic-git pakai ino/mode buat cache heuristic - nilai tetap
    // aman karena kita tidak mengaktifkan stat cache di luar 1 operasi.
    ino: 0,
    mode: isDir ? 0o40000 : 0o100644,
    uid: 0,
    gid: 0,
    dev: 0,
  };
}

/**
 * BUGFIX (7 Agustus 2026): dulu mkdir() di bawah dipanggil dengan
 * { intermediates: false } - cuma bikin SATU level folder. isomorphic-git
 * butuh bikin path bersarang dalam (mis. .git/refs/remotes/origin/) dan
 * ternyata TIDAK selalu memanggil mkdir untuk tiap level satu-satu
 * sebelum writeFile (khususnya buat file ref hasil clone) - akibatnya
 * folder induk gak kebentuk, lalu writeFile gagal ENOENT persis kayak di
 * error log ("...refs/remotes/origin/master: open failed: ENOENT").
 *
 * mkdirRecursive() ini dipakai di DUA tempat: mkdir() publik (biar
 * kompatibel kalau isomorphic-git memang manggilnya), DAN writeFile()
 * (lapis pengaman kalau isomorphic-git skip mkdir). expo-file-system
 * kadang lempar error palsu walau foldernya sukses dibuat (bug lama,
 * https://github.com/expo/expo/issues/2050) - makanya dicek ulang lewat
 * getInfoAsync sebelum dianggap gagal beneran.
 */
async function mkdirRecursive(uri) {
  try {
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  } catch (e) {
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (!info || !info.exists) throw e;
    // foldernya sukses ada meski makeDirectoryAsync lempar error - abaikan.
  }
}

async function ensureParentDir(path) {
  const uri = toUri(path);
  const lastSlash = uri.lastIndexOf('/');
  const parent = uri.slice(0, lastSlash);
  if (!parent || parent === REPOS_ROOT.replace(/\/+$/, '')) return;
  await mkdirRecursive(parent);
}

export const fs = {
  promises: {
    async readFile(path, opts) {
      const uri = toUri(path);
      const encoding = opts && opts.encoding === 'utf8' ? 'utf8' : 'base64';
      try {
        const content = await FileSystem.readAsStringAsync(uri, {
          encoding: encoding === 'utf8' ? FileSystem.EncodingType.UTF8 : FileSystem.EncodingType.Base64,
        });
        if (encoding === 'utf8') return content;
        return Buffer.from(content, 'base64');
      } catch (e) {
        const err = new Error(`ENOENT: no such file or directory, open '${path}'`);
        err.code = 'ENOENT';
        throw err;
      }
    },

    async writeFile(path, data, opts) {
      const uri = toUri(path);
      // Jaga-jaga: pastikan folder induk ada dulu sebelum nulis - lihat
      // catatan BUGFIX di ensureParentDir/mkdirRecursive di atas.
      await ensureParentDir(path);
      const isUtf8 = opts && opts.encoding === 'utf8';
      const content = isUtf8
        ? data
        : Buffer.isBuffer(data)
        ? data.toString('base64')
        : Buffer.from(data).toString('base64');
      await FileSystem.writeAsStringAsync(uri, content, {
        encoding: isUtf8 ? FileSystem.EncodingType.UTF8 : FileSystem.EncodingType.Base64,
      });
    },

    async unlink(path) {
      await FileSystem.deleteAsync(toUri(path), { idempotent: true });
    },

    async readdir(path) {
      try {
        return await FileSystem.readDirectoryAsync(toUri(path));
      } catch (e) {
        const err = new Error(`ENOENT: no such file or directory, scandir '${path}'`);
        err.code = 'ENOENT';
        throw err;
      }
    },

    async mkdir(path) {
      // Sekarang rekursif (intermediates: true) - lihat catatan BUGFIX
      // di mkdirRecursive() di atas. Dulu { intermediates: false } gagal
      // diam-diam buat path bersarang seperti .git/refs/remotes/origin/.
      await mkdirRecursive(toUri(path));
    },

    async rmdir(path) {
      await FileSystem.deleteAsync(toUri(path), { idempotent: true });
    },

    async stat(path) {
      return statLike(path);
    },

    async lstat(path) {
      // Tidak ada symlink di sandbox mobile - lstat = stat biasa.
      return statLike(path);
    },

    async rename(oldPath, newPath) {
      await FileSystem.moveAsync({ from: toUri(oldPath), to: toUri(newPath) });
    },

    async readlink() {
      const err = new Error('Symlink tidak didukung');
      err.code = 'ENOSYS';
      throw err;
    },

    async symlink() {
      const err = new Error('Symlink tidak didukung');
      err.code = 'ENOSYS';
      throw err;
    },
  },
};

/** Pastikan folder root repos/ ada sebelum operasi git pertama. */
export async function ensureReposRoot() {
  const info = await FileSystem.getInfoAsync(REPOS_ROOT);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(REPOS_ROOT, { intermediates: true });
  }
}

/** Path folder repo tertentu di sandbox, dipakai modul Fase 1 (clone dsb). */
export function repoDir(name) {
  // Sanitasi sederhana - cegah nama yang bisa keluar dari REPOS_ROOT
  // (lihat dokumen konsep Bagian 6.2, prinsip sama dengan Zip Slip protection).
  const safe = String(name).replace(/[./\\]/g, '_');
  return `/${safe}`;
}
