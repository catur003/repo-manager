/**
 * localRepos.js
 * Daftar repo yang sudah pernah di-clone ke sandbox HP + metadatanya
 * (favorite, terakhir dibuka, repo aktif). Setara repository_manager()
 * di CLI asli (Bagian 4.1).
 *
 * Disimpan sebagai satu file JSON kecil di documentDirectory - bukan
 * data sensitif (tidak ada token di sini), jadi cukup expo-file-system,
 * tidak perlu SecureStore (yang dicadangkan khusus token & profil, lihat
 * authStore.js).
 *
 * "Repo aktif" cuma nyimpen id-nya di sini (bukan objek terpisah) supaya
 * satu-satunya sumber kebenaran tetap array `repos` - menghindari state
 * ganda yang bisa gak sinkron (mis. repo aktif yang sebenarnya sudah
 * dihapus dari daftar).
 */

import * as FileSystem from 'expo-file-system';
import { logError } from '../logging/logger';

const STORE_PATH = `${FileSystem.documentDirectory}local-repos.json`;

async function readStore() {
  try {
    const info = await FileSystem.getInfoAsync(STORE_PATH);
    if (!info.exists) return { repos: [], activeId: null };
    const raw = await FileSystem.readAsStringAsync(STORE_PATH);
    const parsed = JSON.parse(raw);
    return { repos: Array.isArray(parsed.repos) ? parsed.repos : [], activeId: parsed.activeId ?? null };
  } catch (e) {
    await logError('Gagal baca local-repos.json, mulai dari daftar kosong', e?.message);
    return { repos: [], activeId: null };
  }
}

async function writeStore(store) {
  await FileSystem.writeAsStringAsync(STORE_PATH, JSON.stringify(store));
}

export async function listLocalRepos() {
  const { repos } = await readStore();
  return repos;
}

export async function getActiveRepo() {
  const { repos, activeId } = await readStore();
  if (!activeId) return null;
  return repos.find((r) => r.id === activeId) || null;
}

export async function setActiveRepo(id) {
  const store = await readStore();
  store.activeId = id;
  await writeStore(store);
}

/**
 * Daftarkan repo yang baru selesai di-clone (atau update entry yang sudah
 * ada kalau di-clone ulang). `dirName` adalah nama folder tersanitasi di
 * sandbox (lihat fsAdapter.repoDir), dipakai sebagai id unik.
 */
export async function upsertLocalRepo(entry) {
  const store = await readStore();
  const idx = store.repos.findIndex((r) => r.id === entry.id);
  const now = Date.now();
  const merged = { favorite: false, lastOpenedAt: now, clonedAt: now, ...(idx >= 0 ? store.repos[idx] : {}), ...entry, lastOpenedAt: now };
  if (idx >= 0) {
    store.repos[idx] = merged;
  } else {
    store.repos.push(merged);
  }
  await writeStore(store);
  return merged;
}

export async function touchLastOpened(id) {
  const store = await readStore();
  const idx = store.repos.findIndex((r) => r.id === id);
  if (idx >= 0) {
    store.repos[idx].lastOpenedAt = Date.now();
    await writeStore(store);
  }
}

export async function toggleFavorite(id) {
  const store = await readStore();
  const idx = store.repos.findIndex((r) => r.id === id);
  if (idx >= 0) {
    store.repos[idx].favorite = !store.repos[idx].favorite;
    await writeStore(store);
    return store.repos[idx].favorite;
  }
  return false;
}

/**
 * Hapus dari daftar. `alsoDeleteData` menghapus folder di disk juga
 * (dipanggil terpisah oleh cloneRepo.js supaya modul ini tidak perlu tahu
 * soal fsAdapter - pemisahan tanggung jawab, dan supaya penghapusan file
 * yang gagal tidak bikin metadata ikut nyangkut setengah-setengah).
 */
export async function removeLocalRepo(id) {
  const store = await readStore();
  store.repos = store.repos.filter((r) => r.id !== id);
  if (store.activeId === id) store.activeId = null;
  await writeStore(store);
}

/** Nama folder unik di sandbox - hindari tabrakan kalau dua repo beda
 * owner kebetulan sanitasi namanya sama (mis. "a/b" vs "a.b" -> "a_b"). */
export async function generateUniqueDirId(baseName) {
  const { repos } = await readStore();
  const existingIds = new Set(repos.map((r) => r.id));
  let candidate = baseName;
  let n = 2;
  while (existingIds.has(candidate)) {
    candidate = `${baseName}_${n}`;
    n += 1;
  }
  return candidate;
}
