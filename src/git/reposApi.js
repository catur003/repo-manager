/**
 * reposApi.js
 * Ambil daftar & detail repo milik user yang login, lewat GitHub REST API
 * (bukan scan filesystem seperti CLI asli - lihat dokumen konsep Bagian
 * 4.1, fungsi pilih_repository/cari_repository_otomatis "Diganti").
 */

import { GITHUB_API_BASE } from '../config';
import { logError, logDebug } from '../logging/logger';
import { toFriendlyMessage } from './friendlyError';

class ReposApiError extends Error {}

function authHeaders(token) {
  // WAJIB header Authorization, bukan query string (Bagian 6.1) - token
  // di query string bisa nyangkut di access log kalau ada WebView terlibat.
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
}

async function githubFetch(url, token, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: opts.method || 'GET',
      headers: { ...authHeaders(token), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    await logError('Network error saat fetch GitHub API', e?.message);
    throw new ReposApiError(toFriendlyMessage(e));
  }
  if (!res.ok) {
    let detail = '';
    try {
      const errJson = await res.json();
      detail = errJson?.message || '';
    } catch {
      /* body bukan JSON atau kosong - biarin detail kosong */
    }
    if (res.status === 401) {
      await logError('Fetch GitHub API 401', url);
      throw new ReposApiError(toFriendlyMessage('401 unauthorized'));
    }
    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      const isRateLimit = remaining === '0';
      await logError(`Fetch GitHub API 403${isRateLimit ? ' (rate limit)' : ''}`, url);
      throw new ReposApiError(toFriendlyMessage(isRateLimit ? '403 rate limit' : '403'));
    }
    if (res.status === 422) {
      // Validation error GitHub - biasanya pesannya udah jelas dalam
      // bahasa Inggris (mis. "No commits between X and Y", "A pull
      // request already exists") - tampilkan apa adanya, gak perlu
      // diterjemahkan lewat toFriendlyMessage yang generik.
      await logError('Fetch GitHub API 422 (validation)', `${url} - ${detail}`);
      throw new ReposApiError(detail || 'Permintaan ditolak GitHub (data tidak valid).');
    }
    await logError(`Fetch GitHub API gagal, status ${res.status}`, `${url} - ${detail}`);
    throw new ReposApiError(detail || toFriendlyMessage(`http ${res.status}`));
  }
  if (res.status === 204) return null; // No Content (mis. DELETE berhasil)
  return res.json();
}

/**
 * Daftar repo milik user (owned + collaborator), terbaru diupdate dulu.
 * search dilakukan client-side di sisi pemanggil (list ini sudah cukup
 * kecil untuk kebanyakan user - lihat catatan di RepoListScreen kalau
 * nanti perlu server-side search).
 */
export async function listUserRepos(token, { page = 1, perPage = 30 } = {}) {
  const url = `${GITHUB_API_BASE}/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator`;
  const data = await githubFetch(url, token);
  await logDebug(`listUserRepos halaman ${page} -> ${data.length} repo`);
  return data.map((r) => ({
    id: r.id,
    owner: r.owner?.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    sizeKb: r.size, // KB, dari GitHub API
    updatedAt: r.updated_at,
    cloneUrl: r.clone_url,
    htmlUrl: r.html_url,
    description: r.description,
  }));
}

export async function getRepoDetail(token, owner, name) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${name}`;
  const r = await githubFetch(url, token);
  return {
    id: r.id,
    owner: r.owner?.login,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    sizeKb: r.size,
    updatedAt: r.updated_at,
    cloneUrl: r.clone_url,
    htmlUrl: r.html_url,
    description: r.description,
  };
}

export { ReposApiError, githubFetch };
