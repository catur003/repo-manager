/**
 * StashManagerScreen.js
 * Jawaban buat pertanyaan Zen: stash TERSIMPAN di dalam repo itu sendiri
 * (.git/refs/stash + reflog - dikonfirmasi ke docs resmi isomorphic-git,
 * bukan di area Backup terpisah kita), BISA dihapus manual, dan sekarang
 * ditampilkan dengan nama yang gampang dibaca (bukan string mentah kayak
 * "auto-stash-before-pull:1723027200000").
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Button, InfoBanner, PillRow, ErrorBanner, TopBar } from '../components/UI';
import { LoadingModal, appAlert } from '../components/AppModals';
import { COLORS, SPACING } from '../theme';
import { getFormattedStashList, applyStashAt, dropStashAt } from '../git/syncRepo';

export default function StashManagerScreen({ repo, onBack }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stashes, setStashes] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await getFormattedStashList(repo.dir);
      setStashes(list);
    } catch (e) {
      setError('Gagal membaca daftar stash.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApply = (item) => {
    appAlert(
      'Terapkan Stash Ini?',
      `"${item.label}" akan diterapkan ke working directory sekarang. Kalau ada file yang sama-sama berubah, isinya bisa ketimpa (isomorphic-git gak bisa deteksi conflict otomatis).`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Terapkan',
          style: 'primary',
          onPress: async () => {
            setBusy(true);
            try {
              await applyStashAt(repo.dir, item.index);
              appAlert('Diterapkan', 'Stash sudah diterapkan. Stash-nya tetap ada di daftar - hapus manual kalau sudah gak perlu.');
            } catch (e) {
              appAlert('Gagal', e.message);
            }
            setBusy(false);
            await load();
          },
        },
      ]
    );
  };

  const handleDrop = (item) => {
    appAlert('Hapus Stash Ini?', `"${item.label}" akan dihapus permanen. Perubahan di dalamnya gak bisa dibalikin lagi setelah ini.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'danger',
        onPress: async () => {
          setBusy(true);
          try {
            await dropStashAt(repo.dir, item.index);
            appAlert('Terhapus', 'Stash sudah dihapus.');
          } catch (e) {
            appAlert('Gagal', e.message);
          }
          setBusy(false);
          await load();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={`Stash - ${repo.fullName}`} onBack={onBack} backLabel="Tutup" />
      <View style={styles.container}>
        <InfoBanner>
          Stash tersimpan di dalam repo ini sendiri (bukan di Backup terpisah), cuma lokal di HP ini - gak
          ikut Push/Pull ke GitHub.
        </InfoBanner>

        {loading ? null : (
          <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xl }}>
            <ErrorBanner message={error} />
            {stashes.length === 0 ? <Text style={styles.emptyText}>Belum ada stash tersimpan.</Text> : null}
            {stashes.map((item) => (
              <View key={item.index} style={styles.stashCard}>
                <PillRow icon="archive" label={item.label} sublabel={`stash@{${item.index}}`} disabled={busy} />
                <View style={styles.actionsRow}>
                  <Button title="Terapkan" variant="secondary" onPress={() => handleApply(item)} disabled={busy} style={styles.actionBtn} />
                  <Button title="Hapus" variant="danger" onPress={() => handleDrop(item)} disabled={busy} style={styles.actionBtn} />
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
      <LoadingModal visible={busy} label="Memproses..." icon="archive" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  emptyText: { color: COLORS.inkMuted, marginTop: SPACING.md },
  stashCard: { marginBottom: SPACING.sm },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: -4, marginBottom: SPACING.sm, marginHorizontal: SPACING.sm },
  actionBtn: { flex: 1 },
});
