/**
 * diskUsage.js
 * Helper kecil buat Storage Manager (keputusan 10.1 dokumen konsep):
 * hitung ukuran tiap repo lokal di disk + sisa/total storage HP.
 *
 * expo-file-system gak punya API "ukuran folder" langsung - getInfoAsync
 * di sebuah direktori biasanya balikin size 0/undefined. Jadi harus
 * jalan sendiri: masuk tiap folder, jumlahin size semua file di dalamnya.
 * Bisa agak lambat buat repo besar (ribuan object di .git/objects), tapi
 * cukup buat kebutuhan Storage Manager (dijalankan on-demand, ada loading
 * indicator - lihat StorageManagerScreen.js).
 */

import * as FileSystem from 'expo-file-system';

export async function getDirSizeBytes(uri) {
  let total = 0;
  let entries;
  try {
    entries = await FileSystem.readDirectoryAsync(uri);
  } catch {
    return 0; // folder gak ada/gak kebaca - anggap 0, jangan gagalkan seluruh scan
  }

  for (const name of entries) {
    const childUri = `${uri.replace(/\/+$/, '')}/${name}`;
    const info = await FileSystem.getInfoAsync(childUri).catch(() => null);
    if (!info || !info.exists) continue;
    if (info.isDirectory) {
      total += await getDirSizeBytes(childUri);
    } else {
      total += info.size || 0;
    }
  }
  return total;
}

/** Sisa & total storage HP (dalam bytes). total bisa null di beberapa
 * platform/emulator yang gak expose getTotalDiskCapacityAsync. */
export async function getDeviceStorageInfo() {
  const [free, total] = await Promise.all([
    FileSystem.getFreeDiskStorageAsync().catch(() => null),
    FileSystem.getTotalDiskCapacityAsync().catch(() => null),
  ]);
  return { freeBytes: free, totalBytes: total };
}
