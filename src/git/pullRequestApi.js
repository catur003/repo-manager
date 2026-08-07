/**
 * pullRequestApi.js
 * Padanan buat_pull_request() + merge_pull_request() CLI asli. CLI pakai
 * `gh` CLI (subprocess), app ini langsung ke GitHub REST API (sudah
 * diputuskan dari awal di dokumen konsep Bagian 4.6 - "Via GitHub REST
 * API langsung, hasil akhir sama"). TIDAK butuh server apa pun - ini
 * murni HTTP request dari HP langsung ke api.github.com, sama kayak
 * listUserRepos() yang sudah jalan dari Fase 1.
 */

import { GITHUB_API_BASE } from '../config';
import { githubFetch } from './reposApi';
import { logActivity, logError } from '../logging/logger';

/** Buat PR - padanan buat_pull_request(). `head` harus udah ada di
 * remote (sudah di-push) - GitHub bakal nolak dengan pesan jelas kalau
 * belum. */
export async function createPullRequest(token, owner, name, { title, head, base, body }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${name}/pulls`;
  const pr = await githubFetch(url, token, { method: 'POST', body: { title, head, base, body: body || '' } });
  await logActivity(`Pull Request dibuat: ${head} -> ${base} (${title})`);
  return { number: pr.number, htmlUrl: pr.html_url, title: pr.title };
}

/** List PR open - padanan _list_open_pr(). */
export async function listOpenPullRequests(token, owner, name) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${name}/pulls?state=open&per_page=30`;
  const data = await githubFetch(url, token);
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    headRef: pr.head?.ref,
    baseRef: pr.base?.ref,
    htmlUrl: pr.html_url,
  }));
}

/**
 * Merge PR - padanan merge_pull_request(). `mergeMethod`: 'merge' |
 * 'squash' | 'rebase'. Kalau `deleteBranchAfter` true, branch head
 * dihapus SETELAH merge sukses lewat DELETE ref API langsung.
 */
export async function mergePullRequest(token, owner, name, number, mergeMethod, deleteBranchAfter, headRef) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${name}/pulls/${number}/merge`;
  await githubFetch(url, token, { method: 'PUT', body: { merge_method: mergeMethod } });
  await logActivity(`Pull Request #${number} di-merge (${mergeMethod})`);

  if (deleteBranchAfter && headRef) {
    try {
      const refUrl = `${GITHUB_API_BASE}/repos/${owner}/${name}/git/refs/heads/${encodeURIComponent(headRef)}`;
      await githubFetch(refUrl, token, { method: 'DELETE' });
      await logActivity(`Branch remote ${headRef} dihapus setelah merge PR #${number}`);
    } catch (e) {
      await logError(`Gagal hapus branch remote ${headRef} setelah merge PR`, e?.message);
      // Merge-nya sendiri udah sukses - kegagalan hapus branch jangan
      // bikin seolah-olah merge-nya gagal.
      return { merged: true, branchDeleted: false, branchDeleteError: e.message };
    }
    return { merged: true, branchDeleted: true };
  }
  return { merged: true, branchDeleted: false };
}
