/**
 * SyncScreen.js
 * Padanan langsung push.py + pull.py CLI asli - dua menu BERDIRI SENDIRI
 * (bukan nempel di Compare, keputusan Zen 7 Agustus 2026): Push (Push,
 * Force Push, penjelasan konsep) dan Pull (Pull, Fetch, Refresh).
 *
 * Compare tetap ada terpisah (CompareScreen.js) - fokusnya beda:
 * Compare = "lihat status dulu, dikasih rekomendasi", menu ini = "saya
 * udah tau mau ngapain, langsung aja" - sama seperti CLI, Push/Pull bisa
 * dipanggil kapan pun terlepas dari status ahead/behind.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Button, Card, SectionTitle, InfoBanner, PillRow } from '../components/UI';
import { LoadingModal, appAlert } from '../components/AppModals';
import { useBackHandler } from '../hooks/useBackHandler';
import { COLORS, SPACING } from '../theme';
import { fetchRepo } from '../git/syncRepo';
import { getLocalAheadBehind } from '../git/compareRepository';
import { getCurrentBranch } from '../git/branchOps';
import { useSyncActions } from '../hooks/useSyncActions';

export default function SyncScreen({ repo, token, author, mode, onBack }) {
  const sync = useSyncActions(repo, token, author, null);
  const [showAbout, setShowAbout] = useState(false);
  const [aboutForce, setAboutForce] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [localBusyLabel, setLocalBusyLabel] = useState('');

  async function withBusy(label, fn) {
    setLocalBusyLabel(label);
    setLocalBusy(true);
    try {
      return await fn();
    } finally {
      setLocalBusy(false);
    }
  }

  // BUGFIX (7 Agustus 2026): resolve branch AKTIF, bukan repo.defaultBranch statis.
  const doFetch = async () => {
    try {
      const branch = (await getCurrentBranch(repo.dir)) || repo.defaultBranch;
      await withBusy('Fetch...', () => fetchRepo(repo.dir, branch, token));
      appAlert('Fetch Berhasil', 'Info remote sudah diperbarui.');
    } catch (e) {
      appAlert('Fetch Gagal', e.message);
    }
  };

  const doRefresh = async () => {
    const branch = (await getCurrentBranch(repo.dir)) || repo.defaultBranch;
    const result = await getLocalAheadBehind(repo.dir, branch).catch(() => null);
    if (!result) {
      appAlert('Refresh', 'Belum ada info remote-tracking - coba Fetch dulu.');
      return;
    }
    appAlert('Status Lokal', `${result.ahead} commit ahead · ${result.behind} commit behind (dari data fetch terakhir, bukan cek baru ke GitHub).`);
  };

  const isPush = mode === 'push';

  useBackHandler(() => {
    if (sync.forcePushMode) { sync.cancelForcePush(); return true; }
    return false;
  }, [sync.forcePushMode]);

  return (
    <View style={styles.container}>
      <SectionTitle>{isPush ? 'Push' : 'Pull'} - {repo.fullName}</SectionTitle>

      {isPush ? (
        <>
          <PillRow icon="upload-cloud" label="Push" sublabel="Kirim commit lokal ke GitHub" onPress={() => sync.doPush()} />
          <PillRow icon="alert-triangle" label="Force Push" sublabel="Timpa riwayat di GitHub (berbahaya)" onPress={sync.startForcePush} />
          <PillRow icon="help-circle" label="Apa itu Push?" onPress={() => setShowAbout((v) => !v)} />
          {showAbout ? (
            <InfoBanner>
              Push adalah proses mengirim commit dari HP kamu ke repository di GitHub, supaya orang lain juga
              bisa melihat perubahan yang sudah kamu buat.
            </InfoBanner>
          ) : null}
          <PillRow icon="help-circle" label="Apa itu Force Push?" onPress={() => setAboutForce((v) => !v)} />
          {aboutForce ? (
            <InfoBanner>
              Force Push memaksa GitHub memakai riwayat commit dari HP kamu, walaupun beda dengan riwayat yang
              sudah ada di sana. BERBAHAYA - bisa menghapus/menimpa commit orang lain yang belum sempat kamu
              pull. Pakai cuma kalau benar-benar yakin.
            </InfoBanner>
          ) : null}

          {sync.forcePushMode ? (
            <Card>
              {sync.protectedBranchWarning ? (
                <InfoBanner>
                  PERHATIAN: branch "{sync.protectedBranchWarning}" kelihatan seperti branch penting (main/
                  master/production). Force push ke sini biasanya cuma dilakukan kalau BENAR-BENAR yakin.
                </InfoBanner>
              ) : null}
              <InfoBanner>
                Force Push akan MENIMPA riwayat commit di GitHub dengan riwayat lokal. Perubahan orang lain yang
                belum kamu pull bisa HILANG. Ketik "YA" (huruf besar) untuk lanjut.
              </InfoBanner>
              <TextInput
                style={styles.input}
                placeholder='Ketik "YA"'
                placeholderTextColor={COLORS.inkFaint}
                value={sync.confirmText}
                onChangeText={sync.setConfirmText}
                autoCapitalize="characters"
              />
              <Button title="Lanjutkan Force Push" variant="danger" onPress={() => sync.confirmForcePush()} disabled={sync.confirmText !== 'YA'} />
              <Button title="Batal" variant="secondary" onPress={sync.cancelForcePush} />
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <PillRow icon="download-cloud" label="Pull" sublabel="Ambil & gabungkan perubahan terbaru dari GitHub" onPress={() => sync.doPull()} />
          <PillRow icon="refresh-cw" label="Fetch" sublabel="Cek perubahan di GitHub tanpa menggabungkan" onPress={doFetch} />
          <PillRow icon="activity" label="Refresh" sublabel="Lihat status ahead/behind dari data terakhir (offline)" onPress={doRefresh} />
        </>
      )}

      <Button title="Tutup" variant="secondary" onPress={onBack} />

      <LoadingModal visible={sync.busy || localBusy} label={sync.busyLabel || localBusyLabel} icon={isPush ? 'upload-cloud' : 'download-cloud'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
    fontWeight: '700',
  },
});
