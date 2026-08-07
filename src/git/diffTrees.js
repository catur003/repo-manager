/**
 * diffTrees.js
 * Bandingin isi 2 commit (oid lama vs oid baru), balikin daftar path
 * file yang beda - dipakai buat ringkasan "file apa aja yang barusan
 * ke-push/ke-pull" (permintaan Zen: informatif tapi jangan kebanyakan,
 * jadi dibatasi + ada hitungan sisa kalau lebih).
 *
 * Gak ada fungsi "diff 2 commit" siap pakai di isomorphic-git - pakai
 * git.walk() ngebandingin 2 TREE bareng, itu pola standar yang
 * didokumentasikan isomorphic-git sendiri buat kasus kayak gini.
 *
 * CATATAN JUJUR: belum bisa dites di environment beneran (gak ada RN
 * runtime di sini) - kalau ternyata daftar filenya kosong terus padahal
 * jelas ada perubahan, kabari saya, kemungkinan perilaku git.walk()
 * map/reduce-nya beda dari yang saya asumsikan.
 */

import git, { TREE } from 'isomorphic-git';
import { fs } from './fsAdapter';

const DEFAULT_LIMIT = 20;

export async function diffCommitFiles(dir, oidA, oidB, limit = DEFAULT_LIMIT) {
  if (!oidA || !oidB || oidA === oidB) return { files: [], remaining: 0, total: 0 };

  const changed = [];
  await git.walk({
    fs,
    dir,
    trees: [TREE({ ref: oidA }), TREE({ ref: oidB })],
    map: async (filepath, [a, b]) => {
      if (filepath === '.') return;
      const aType = a ? await a.type() : null;
      const bType = b ? await b.type() : null;
      // Folder sendiri gak dihitung sebagai "file berubah" - biarin walk
      // tetap turun ke isinya (map jalan lagi buat tiap anak), cuma gak
      // dimasukin ke daftar.
      if (aType === 'tree' || bType === 'tree') return;
      const aOid = a ? await a.oid() : null;
      const bOid = b ? await b.oid() : null;
      if (aOid !== bOid) changed.push(filepath);
    },
  });

  changed.sort();
  return {
    files: changed.slice(0, limit),
    remaining: Math.max(0, changed.length - limit),
    total: changed.length,
  };
}
