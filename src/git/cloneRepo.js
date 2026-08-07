/**
 * cloneRepo.js
 * Clone repo GitHub ke sandbox app pakai isomorphic-git (Alur 3.2).
 *
 * Preflight sebelum clone (poin 3.2.3 dokumen konsep):
 *  - cek sisa storage HP (peringatan pasif <500MB, keputusan 10.1)
 *  - cek ukuran repo dari GitHub API, tawarkan/pakai shallow clone kalau besar
 *  - kegagalan jaringan ditangani lewat friendlyError, bukan pesan mentah
 *
 * Token dikirim lewat `onAuth` (header Authorization di balik layar oleh
 * isomorphic-git), TIDAK PERNAH disisipkan ke URL clone (Bagian 6.1).
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import * as FileSystem from 'expo-file-system';
import { fs, ensureReposRoot, repoDir, REPOS_ROOT } from './fsAdapter';
import { logActivity, logError, logDebug } from '../logging/logger';
import { toFriendlyMessage } from './friendlyError';
import { upsertLocalRepo, generateUniqueDirId } from './localRepos';

class CloneError extends Error {}

const LARGE_REPO_WARNING_KB = 100 * 1024; // >100MB, keputusan 10.1/6.4
const LOW_STORAGE_WARNING_BYTES = 500 * 1024 * 1024; // <500MB sisa, keputusan 10.1

/**
 * Cek kondisi sebelum mulai clone. Dipanggil terpisah dari doClone() supaya
 * UI (RepoListScreen) bisa tampilkan konfirmasi dulu ke user kalau ada
 * warning, sebelum benar-benar mulai proses yang berat.
 */
export async function preflightClone(repo) {
  const warnings = [];

  const freeBytes = await FileSystem.getFreeDiskStorageAsync().catch(() => null);
  if (freeBytes != null && freeBytes < LOW_STORAGE_WARNING_BYTES) {
    warnings.push(`Sisa penyimpanan HP tinggal ${(freeBytes / (1024 * 1024)).toFixed(0)}MB. Pertimbangkan kosongkan ruang dulu.`);
  }

  const isLarge = (repo.sizeKb || 0) > LARGE_REPO_WARNING_KB;
  if (isLarge) {
    warnings.push(`Repo ini cukup besar (~${Math.round(repo.sizeKb / 1024)}MB). Disarankan pakai shallow clone (depth=1).`);
  }

  // Deteksi kemungkinan konflik nama folder (repo dengan owner/nama beda
  // tapi sanitasi jadi sama) ditangani generateUniqueDirId() saat doClone,
  // bukan di sini - preflight cuma untuk info yang ditampilkan ke user.
  return { warnings, recommendShallow: isLarge };
}

/**
 * Jalankan clone sungguhan. onProgress(phase, loaded, total) dipanggil
 * isomorphic-git secara berkala untuk progress bar UI.
 */
export async function doClone({ repo, token, shallow = true, onProgress }) {
  await ensureReposRoot();

  const baseId = `${repo.owner}_${repo.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const id = await generateUniqueDirId(baseId);
  const dir = repoDir(id);
  const fullUri = `${REPOS_ROOT}${id.replace(/^\/+/, '')}`;

  try {
    await FileSystem.makeDirectoryAsync(fullUri, { intermediates: true });

    await git.clone({
      fs,
      http,
      dir,
      url: repo.cloneUrl,
      ref: repo.defaultBranch,
      singleBranch: true,
      depth: shallow ? 1 : undefined,
      onAuth: () => ({ username: token }), // header Authorization di balik layar, bukan di URL
      onProgress: (evt) => {
        if (onProgress) onProgress(evt.phase, evt.loaded, evt.total);
      },
    });

    // Deteksi Git LFS & submodule setelah clone (keputusan 10.2 & 10.3) -
    // bukan gagal diam, tapi juga bukan blocker clone-nya sendiri.
    const flags = await detectRepoFlags(dir);

    const entry = await upsertLocalRepo({
      id,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch,
      cloneUrl: repo.cloneUrl,
      htmlUrl: repo.htmlUrl,
      dir,
      shallow,
      hasLfs: flags.hasLfs,
      hasSubmodule: flags.hasSubmodule,
    });

    await logActivity(`Clone repo ${repo.fullName} berhasil${shallow ? ' (shallow)' : ''}`);
    return entry;
  } catch (e) {
    await logError(`Clone repo ${repo.fullName} gagal`, e?.message);
    // Bersihkan folder setengah-jadi supaya tidak nyangkut sebagai repo
    // korup yang membingungkan kalau user coba clone ulang.
    await FileSystem.deleteAsync(fullUri, { idempotent: true }).catch(() => {});
    throw new CloneError(toFriendlyMessage(e));
  }
}

async function detectRepoFlags(dir) {
  let hasLfs = false;
  let hasSubmodule = false;
  try {
    const gitattributes = await fs.promises.readFile(`${dir}/.gitattributes`, { encoding: 'utf8' }).catch(() => '');
    hasLfs = /filter=lfs/.test(gitattributes);
  } catch {
    /* file tidak ada, bukan error */
  }
  try {
    await fs.promises.stat(`${dir}/.gitmodules`);
    hasSubmodule = true;
  } catch {
    /* file tidak ada, bukan error */
  }
  return { hasLfs, hasSubmodule };
}

export { CloneError };
