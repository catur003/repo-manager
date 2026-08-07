/**
 * repoStatus.js
 * Padanan langsung dashboard.py di CLI asli - kumpulin semua field status
 * repo aktif buat panel Dashboard (permintaan Zen 7 Agustus 2026: panel
 * teks persis kayak dashboard CLI, bukan cuma badge status ringkas).
 *
 * Field yang dikumpulkan sama persis urutannya sama get_status_summary()
 * CLI asli: branch, remote, connected, upstream, ahead/behind, status
 * git, commit terakhir, jumlah file berubah, terakhir push/pull.
 *
 * "Ahead/Behind" dihitung OFFLINE (getLocalAheadBehind, tanpa fetch) -
 * sama alasan dengan Storage Manager: dashboard dibuka tiap kali app
 * dibuka/pindah tab, gak masuk akal nembak GitHub API tiap saat.
 *
 * "Terakhir Push"/"Terakhir Pull" masih '-' terus buat sekarang - CLI
 * asli nyatetnya manual tiap kali push/pull SUKSES (get_repo_event), dan
 * fitur Push/Pull sendiri baru dibangun di Fase 4. Field-nya sudah
 * disiapkan di sini supaya begitu Fase 4 jalan, tinggal isi localRepos
 * entry-nya (lastPush/lastPull timestamp), gak perlu ubah struktur ini
 * lagi.
 */

import git from 'isomorphic-git';
import { fs, REPOS_ROOT } from './fsAdapter';
import { getLocalAheadBehind } from './compareRepository';
import { redactSecrets } from '../logging/logger';
import { formatDateTime } from '../utils/format';

export async function getRepoStatusSummary(repo) {
  if (!repo) {
    return {
      repoName: 'Belum dipilih',
      location: '-',
      branch: '-',
      remote: '-',
      connected: 'Tidak',
      upstream: '-',
      statusLabel: 'Tidak diketahui',
      ahead: '-',
      behind: '-',
      lastCommit: '-',
      changedFiles: 0,
      lastPush: '-',
      lastPull: '-',
      now: formatDateTime(),
    };
  }

  const dir = repo.dir;
  const location = `${REPOS_ROOT}${String(dir).replace(/^\/+/, '')}`;

  const branch = (await git.currentBranch({ fs, dir, fullname: false }).catch(() => null)) || repo.defaultBranch || '-';

  let remote = '-';
  try {
    const remotes = await git.listRemotes({ fs, dir });
    const origin = remotes.find((r) => r.remote === 'origin') || remotes[0];
    if (origin) remote = redactSecrets(origin.url);
  } catch {
    /* belum ada remote terdaftar - biarkan '-' */
  }
  const connected = remote !== '-' ? 'Ya' : 'Tidak (belum ada remote)';

  let upstream = '-';
  let ahead = '-';
  let behind = '-';
  const hasRemoteRef = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` }).catch(() => null);
  if (hasRemoteRef) {
    upstream = `origin/${branch}`;
    const result = await getLocalAheadBehind(dir, branch).catch(() => null);
    if (result) {
      ahead = result.ahead;
      behind = result.behind;
    }
  }

  let lastCommit = '-';
  try {
    const log = await git.log({ fs, dir, depth: 1 });
    if (log.length) {
      const c = log[0];
      const firstLine = c.commit.message.split('\n')[0];
      lastCommit = `${c.oid.slice(0, 7)} ${firstLine}`;
    }
  } catch {
    /* repo belum ada commit sama sekali - biarkan '-' */
  }

  let changedFiles = 0;
  let statusLabel = 'Tidak diketahui';
  try {
    const rows = await git.statusMatrix({ fs, dir });
    changedFiles = rows.filter(([, head, workdir, stage]) => head !== workdir || workdir !== stage).length;
    statusLabel = changedFiles === 0 ? 'Bersih (tidak ada perubahan)' : `${changedFiles} file berubah`;
  } catch {
    /* gagal baca status - biarkan default "Tidak diketahui" */
  }

  return {
    repoName: repo.name || repo.fullName || '-',
    location,
    branch,
    remote,
    connected,
    upstream,
    statusLabel,
    ahead,
    behind,
    lastCommit,
    changedFiles,
    lastPush: repo.lastPush ? formatDateTime(new Date(repo.lastPush)) : '-',
    lastPull: repo.lastPull ? formatDateTime(new Date(repo.lastPull)) : '-',
    now: formatDateTime(),
  };
}
