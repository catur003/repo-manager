/**
 * logger.js
 * Sistem 3 lapis log, meniru pola logger.py di CLI asli:
 *   - Activity log : kalimat manusia, TERLIHAT user (mis. "Push berhasil")
 *   - Error log     : konteks + detail teknis, TERSEMBUNYI dari user,
 *                     cuma bisa diakses lewat "Export Debug Log"
 *   - Debug log     : jejak operasi git mentah, TERSEMBUNYI dari user
 *
 * ATURAN WAJIB (lihat dokumen konsep Bagian 5 & 6.1):
 * - Semua string yang masuk ke log APAPUN wajib lewat redactSecrets()
 *   dulu, supaya token GitHub tidak pernah nyangkut plaintext di disk.
 * - User tidak pernah melihat stack trace / pesan error mentah di UI utama.
 */

import * as FileSystem from 'expo-file-system';
import { formatDateTime } from '../utils/format';

const LOG_DIR = `${FileSystem.documentDirectory}logs/`;
const ACTIVITY_LOG = `${LOG_DIR}activity.log`;
const ERROR_LOG = `${LOG_DIR}error.log`;
const DEBUG_LOG = `${LOG_DIR}debug.log`;

const MAX_LOG_SIZE_BYTES = 2 * 1024 * 1024; // 2MB per file, biar gak numpuk gak kekontrol

async function ensureLogDir() {
  const info = await FileSystem.getInfoAsync(LOG_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LOG_DIR, { intermediates: true });
  }
}

/**
 * Samarkan kredensial yang mungkin nempel di URL/pesan (pola
 * 'https://user:TOKEN@host/...' atau token mentah di query string)
 * sebelum ditulis ke log manapun. Port langsung dari redact_secrets()
 * di utils.py CLI asli, ditambah pola Authorization header & PAT GitHub.
 */
export function redactSecrets(text) {
  if (!text) return text;
  let out = String(text);
  // https://user:TOKEN@host/...
  out = out.replace(/(https?:\/\/)([^/@\s:]+):([^/@\s]+)@/g, '$1$2:***@');
  // Authorization: Bearer xxxx / token xxxx
  out = out.replace(/(Authorization['":\s]+(Bearer|token)\s+)[A-Za-z0-9_\-.]+/gi, '$1***');
  // GitHub PAT/OAuth token patterns (ghp_, gho_, ghu_, ghs_, ghr_ + 36 char)
  out = out.replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, '***REDACTED_TOKEN***');
  return out;
}

// BUGFIX (laporan Zen): appendLine() dulu baca-lalu-tulis TANPA kunci -
// kalau 2 pemanggilan log kejadian hampir bersamaan (mis. Dashboard
// refresh + Pull jalan bareng), keduanya bisa baca isi file yang sama
// sebelum salah satu sempat nulis balik - yang nulis belakangan NIMPA
// punya yang duluan, entry hilang tanpa jejak. Sekarang tiap path log
// (activity/error/debug) punya antrian sendiri (`writeQueues`) - tulisan
// baru nunggu tulisan sebelumnya ke path YANG SAMA selesai dulu, gak ada
// lagi race read-modify-write.
const writeQueues = new Map(); // path -> Promise (tulisan terakhir yang lagi jalan)

function queueWrite(path, task) {
  const prev = writeQueues.get(path) || Promise.resolve();
  const next = prev.then(task, task); // tetap jalanin task walau tulisan sebelumnya gagal
  writeQueues.set(path, next);
  return next;
}

async function appendLine(path, line) {
  await queueWrite(path, async () => {
    try {
      await ensureLogDir();
      let info = await FileSystem.getInfoAsync(path);
      if (info.exists && info.size > MAX_LOG_SIZE_BYTES) {
        // Rotasi sederhana: buang file lama, mulai baru, daripada tumbuh tanpa batas.
        await FileSystem.deleteAsync(path, { idempotent: true });
        info = { exists: false };
      }
      const existing = info.exists ? await FileSystem.readAsStringAsync(path) : '';
      await FileSystem.writeAsStringAsync(path, existing + line + '\n');
    } catch (e) {
      // Kegagalan logging TIDAK BOLEH menghentikan aplikasi (sama seperti CLI asli).
      console.warn('Logger gagal menulis:', e?.message);
    }
  });
}

function timestamp() {
  return new Date().toTimeString().slice(0, 5); // HH:MM
}

// BUGFIX (7 Agustus 2026, laporan Zen): dulu pakai toISOString() (UTC,
// ada "Z" di akhir) - jam-nya beda dari jam HP kalau HP-nya gak di UTC+0
// (mis. WIB = UTC+7, beda 7 jam). Sekarang pakai jam LOKAL device,
// format sama kayak yang dipakai Dashboard (formatDateTime).
function fullTimestamp() {
  return formatDateTime();
}

/** Log yang terlihat user di layar "Log Aktivitas". */
export async function logActivity(message) {
  await appendLine(ACTIVITY_LOG, `${timestamp()} ${redactSecrets(message)}`);
}

/**
 * Log teknis, TIDAK ditampilkan langsung ke user. Dipanggil dari catch
 * block di seluruh app - context singkat + detail opsional (pesan error
 * asli, response API, dll). Semua di-redact sebelum ditulis.
 */
export async function logError(context, detail = '') {
  const line = `\n[${fullTimestamp()}] ${redactSecrets(context)}${
    detail ? `\nDetail: ${redactSecrets(String(detail))}` : ''
  }`;
  await appendLine(ERROR_LOG, line);
}

/** Jejak operasi non-error (mis. "git.push dipanggil, branch=main"). */
export async function logDebug(message) {
  await appendLine(DEBUG_LOG, `[${fullTimestamp()}] ${redactSecrets(message)}`);
}

export async function readRecentActivity(n = 30) {
  try {
    const info = await FileSystem.getInfoAsync(ACTIVITY_LOG);
    if (!info.exists) return [];
    const content = await FileSystem.readAsStringAsync(ACTIVITY_LOG);
    return content.split('\n').filter(Boolean).slice(-n).reverse();
  } catch {
    return [];
  }
}

/**
 * Gabungkan error.log + debug.log jadi satu string untuk tombol
 * "Export Debug Log" (Share). Ini SATU-SATUNYA jalur user bisa melihat
 * isi error/debug log - tidak pernah ditampilkan langsung di UI utama.
 */
export async function exportDebugBundle() {
  const parts = [];
  for (const [label, path] of [['=== ERROR LOG ===', ERROR_LOG], ['=== DEBUG LOG ===', DEBUG_LOG]]) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(path);
        parts.push(`${label}\n${content}`);
      }
    } catch {
      // skip file yang gagal dibaca, jangan gagalkan seluruh export
    }
  }
  return parts.join('\n\n');
}
