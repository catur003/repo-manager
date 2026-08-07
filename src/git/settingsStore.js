/**
 * settingsStore.js
 * Pengaturan app tersimpan lokal (JSON di sandbox, pola sama kayak
 * localRepos.js). Baru satu setting: autoStash (Fase 8 nanti bakal
 * nambah toggle lain - konfirmasi delete, force push, dst, sesuai
 * dokumen konsep Bagian 4.9).
 */

import * as FileSystem from 'expo-file-system';

const SETTINGS_PATH = `${FileSystem.documentDirectory}settings.json`;

const DEFAULTS = {
  autoStash: true, // Pull auto-stash working tree kotor - bisa dimatiin (permintaan Zen 7 Agustus 2026)
};

let cache = null;

async function readSettings() {
  if (cache) return cache;
  try {
    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    cache = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

async function writeSettings(next) {
  cache = next;
  await FileSystem.writeAsStringAsync(SETTINGS_PATH, JSON.stringify(next));
}

export async function getSetting(key) {
  const settings = await readSettings();
  return settings[key];
}

export async function setSetting(key, value) {
  const settings = await readSettings();
  const next = { ...settings, [key]: value };
  await writeSettings(next);
  return next;
}
