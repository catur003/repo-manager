/**
 * githubAuth.js
 * Implementasi OAuth Device Flow GitHub - TIDAK butuh client_secret,
 * makanya aman dipakai di app publik tanpa server (lihat dokumen
 * konsep Bagian 2 & alur 3.1).
 *
 * Alur:
 *   1. requestDeviceCode()  -> dapat device_code + user_code (6 digit)
 *   2. User buka browser, masukkan user_code, approve
 *   3. pollForToken()       -> polling sampai user approve/timeout/deny
 */

import {
  GITHUB_CLIENT_ID,
  GITHUB_SCOPES,
  GITHUB_DEVICE_CODE_URL,
  GITHUB_TOKEN_URL,
  GITHUB_API_BASE,
} from '../config';
import { logActivity, logError, logDebug } from '../logging/logger';

class AuthError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'expired' | 'denied' | 'network' | 'unknown'
  }
}

/** Langkah 1: minta device_code + user_code dari GitHub. */
export async function requestDeviceCode() {
  try {
    const res = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: GITHUB_SCOPES }),
    });
    if (!res.ok) {
      throw new AuthError('Tidak dapat menghubungi GitHub. Periksa koneksi internet.', 'network');
    }
    const data = await res.json();
    if (data.error) {
      await logError('Gagal minta device code', data.error_description || data.error);
      throw new AuthError('GitHub menolak permintaan login. Coba lagi nanti.', 'unknown');
    }
    await logDebug('Device code diminta dari GitHub');
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      verificationUriComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval || 5,
    };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    await logError('Exception saat requestDeviceCode', e?.message);
    throw new AuthError('Tidak dapat menghubungi GitHub. Periksa koneksi internet.', 'network');
  }
}

/**
 * Langkah 2: polling token endpoint sampai user approve, ditolak, atau expired.
 * onTick(secondsLeft) dipanggil tiap polling supaya UI bisa update countdown.
 */
export async function pollForToken(deviceCode, intervalSec, expiresInSec, onTick) {
  const startTime = Date.now();
  let interval = intervalSec;

  while (true) {
    const elapsed = (Date.now() - startTime) / 1000;
    const secondsLeft = Math.max(0, Math.round(expiresInSec - elapsed));
    if (onTick) onTick(secondsLeft);

    if (elapsed >= expiresInSec) {
      throw new AuthError('Kode login sudah kadaluarsa. Silakan mulai login ulang.', 'expired');
    }

    await new Promise((r) => setTimeout(r, interval * 1000));

    let res, data;
    try {
      res = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      data = await res.json();
    } catch (e) {
      // Gangguan jaringan sesaat saat polling - jangan langsung gagal total,
      // coba lagi di iterasi berikutnya selama belum expired.
      await logDebug(`Polling token gagal sementara: ${e?.message}`);
      continue;
    }

    if (data.access_token) {
      await logActivity('Login GitHub berhasil');
      return data.access_token;
    }

    switch (data.error) {
      case 'authorization_pending':
        continue; // user belum approve, lanjut polling
      case 'slow_down':
        interval += 5; // GitHub minta app polling lebih jarang
        continue;
      case 'expired_token':
        throw new AuthError('Kode login sudah kadaluarsa. Silakan mulai login ulang.', 'expired');
      case 'access_denied':
        throw new AuthError('Login dibatalkan.', 'denied');
      default:
        await logError('Polling token error tidak dikenal', data.error_description || data.error);
        throw new AuthError('Terjadi kesalahan saat login. Coba lagi.', 'unknown');
    }
  }
}

/** Ambil profil GitHub user yang lagi login (dipakai isi identitas commit default). */
export async function fetchGithubProfile(token) {
  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    await logError('Gagal fetch profil GitHub', `status ${res.status}`);
    throw new AuthError('Gagal mengambil profil GitHub.', 'unknown');
  }
  const data = await res.json();
  // Email publik GitHub sering disembunyikan - pakai noreply bawaan GitHub,
  // sama seperti pola _auto_isi_identitas_dari_gh() di CLI asli, supaya
  // aman dipakai untuk commit tanpa expose email asli user.
  const noreplyEmail = `${data.id}+${data.login}@users.noreply.github.com`;
  return {
    login: data.login,
    name: data.name || data.login,
    avatarUrl: data.avatar_url,
    email: data.email || noreplyEmail,
  };
}

export { AuthError };
