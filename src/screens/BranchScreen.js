/**
 * BranchScreen.js
 * Padanan menu Branch CLI asli. Tap satu baris branch -> muncul pilihan
 * aksi (Checkout/Rename/Delete) lewat appAlert, sesuai pola
 * questionary.select() CLI - daripada bikin banyak tombol kecil di tiap
 * baris yang bakal sempit di layar HP.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TextInput } from 'react-native';
import { Button, Card, SectionTitle, InfoBanner, PillRow, ErrorBanner, TopBar } from '../components/UI';
import { LoadingModal, appAlert } from '../components/AppModals';
import { COLORS, SPACING } from '../theme';
import {
  listLocalBranches,
  getCurrentBranch,
  checkoutBranch,
  createBranch,
  renameBranch,
  deleteBranchLocal,
  deleteBranchRemote,
  getBranchSyncData,
} from '../git/branchOps';
import { fetchRepo } from '../git/syncRepo';

export default function BranchScreen({ repo, token, onBack }) {
  const [mode, setMode] = useState('list'); // list | create | sync
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Memproses...');
  const [branches, setBranches] = useState([]);
  const [current, setCurrent] = useState(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [syncData, setSyncData] = useState(null);
  const [error, setError] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, cur] = await Promise.all([listLocalBranches(repo.dir), getCurrentBranch(repo.dir)]);
      setBranches(list);
      setCurrent(cur);
    } catch (e) {
      setError('Gagal membaca daftar branch.');
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    load();
  }, [load]);

  const doCheckout = async (name) => {
    setBusy(true);
    setBusyLabel(`Checkout ke ${name}...`);
    try {
      await checkoutBranch(repo.dir, name);
      appAlert('Berhasil', `Sekarang di branch "${name}".`);
      await load();
    } catch (e) {
      appAlert('Checkout Gagal', e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmRename = async () => {
    setBusy(true);
    setBusyLabel('Rename branch...');
    try {
      await renameBranch(repo.dir, renameTarget, renameValue);
      appAlert('Berhasil', `Branch diubah nama jadi "${renameValue}".`);
      setRenameTarget(null);
      setRenameValue('');
      await load();
    } catch (e) {
      appAlert('Rename Gagal', e.message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (name, force = false) => {
    setBusy(true);
    setBusyLabel('Menghapus branch...');
    try {
      const result = await deleteBranchLocal(repo.dir, name, force);
      setBusy(false);
      if (result.needsForce) {
        appAlert(
          'Branch Belum Sepenuhnya Di-merge',
          `"${name}" punya commit yang belum masuk ke branch aktif. Hapus paksa? Perubahan yang belum di-merge akan hilang.`,
          [
            { text: 'Batal', style: 'cancel' },
            { text: 'Hapus Paksa', style: 'danger', onPress: () => doDelete(name, true) },
          ]
        );
        return;
      }
      appAlert('Terhapus', `Branch "${name}" berhasil dihapus.`);
      await load();
    } catch (e) {
      setBusy(false);
      appAlert('Gagal Menghapus', e.message);
    }
  };

  const handleBranchTap = (name) => {
    if (name === current) {
      appAlert(name, 'Ini branch yang lagi aktif.', [
        { text: 'Rename', style: 'primary', onPress: () => setRenameTarget(name) },
        { text: 'Tutup', style: 'cancel' },
      ]);
      return;
    }
    appAlert(name, 'Pilih aksi:', [
      { text: 'Checkout', style: 'primary', onPress: () => doCheckout(name) },
      { text: 'Rename', style: 'primary', onPress: () => setRenameTarget(name) },
      { text: 'Hapus', style: 'danger', onPress: () => doDelete(name) },
      { text: 'Batal', style: 'cancel' },
    ]);
  };

  const doCreate = async () => {
    setBusy(true);
    setBusyLabel('Membuat branch...');
    try {
      await createBranch(repo.dir, newBranchName);
      appAlert('Berhasil', `Branch "${newBranchName.trim()}" dibuat dan aktif.`);
      setNewBranchName('');
      setMode('list');
      await load();
    } catch (e) {
      appAlert('Gagal', e.message);
    } finally {
      setBusy(false);
    }
  };

  const openSync = async () => {
    setBusy(true);
    setBusyLabel('Fetch dari GitHub...');
    try {
      await fetchRepo(repo.dir, repo.defaultBranch, token);
      const data = await getBranchSyncData(repo.dir);
      setSyncData(data);
      setMode('sync');
    } catch (e) {
      appAlert('Fetch Gagal', e.message);
    } finally {
      setBusy(false);
    }
  };

  const refreshSync = async () => {
    setBusy(true);
    setBusyLabel('Memuat ulang...');
    const data = await getBranchSyncData(repo.dir);
    setSyncData(data);
    setBusy(false);
  };

  const handleDeleteRemote = (name) => {
    appAlert('Hapus Branch Remote?', `"${name}" akan dihapus dari GitHub. Ini memengaruhi semua orang yang pakai repo ini.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'danger',
        onPress: async () => {
          setBusy(true);
          setBusyLabel('Menghapus branch remote...');
          try {
            await deleteBranchRemote(repo.dir, name, token);
            appAlert('Terhapus', `Branch remote "${name}" sudah dihapus.`);
            await refreshSync();
          } catch (e) {
            appAlert('Gagal', e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return <LoadingModal visible label="Memuat..." icon="git-branch" />;
  }

  let content = null;

  if (renameTarget) {
    content = (
      <View style={styles.container}>
        <SectionTitle>Rename Branch</SectionTitle>
        <Card>
          <TextInput
            style={styles.input}
            placeholder={`Nama baru untuk "${renameTarget}"`}
            placeholderTextColor={COLORS.inkFaint}
            value={renameValue}
            onChangeText={setRenameValue}
            autoCapitalize="none"
          />
          <Button title="Simpan" onPress={confirmRename} disabled={!renameValue.trim()} />
          <Button
            title="Batal"
            variant="secondary"
            onPress={() => {
              setRenameTarget(null);
              setRenameValue('');
            }}
          />
        </Card>
      </View>
    );
  } else if (mode === 'create') {
    content = (
      <View style={styles.container}>
        <SectionTitle>Buat Branch Baru</SectionTitle>
        <Card>
          <InfoBanner>Branch baru dibuat dari posisi commit saat ini dan langsung jadi aktif.</InfoBanner>
          <TextInput
            style={styles.input}
            placeholder="Nama branch baru"
            placeholderTextColor={COLORS.inkFaint}
            value={newBranchName}
            onChangeText={setNewBranchName}
            autoCapitalize="none"
          />
          <Button title="Buat" onPress={doCreate} disabled={!newBranchName.trim()} />
          <Button title="Batal" variant="secondary" onPress={() => setMode('list')} />
        </Card>
      </View>
    );
  } else if (mode === 'sync') {
    content = (
      <View style={{ flex: 1 }}>
        <TopBar title="Sync Branch" onBack={() => setMode('list')} />
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        {syncData?.both.map((b) => (
          <PillRow
            key={b.name}
            icon="git-branch"
            tone={b.isCurrent ? 'accent' : 'default'}
            label={b.isCurrent ? `${b.name} (aktif)` : b.name}
            sublabel={`Lokal + Remote · ${b.ahead} ahead / ${b.behind} behind`}
          />
        ))}
        {syncData?.onlyLocal.map((b) => (
          <PillRow key={b.name} icon="git-branch" tone="warning" label={b.isCurrent ? `${b.name} (aktif)` : b.name} sublabel="Hanya Lokal" />
        ))}
        {syncData?.onlyRemote.map((b) => (
          <View key={b.name} style={{ marginBottom: SPACING.sm }}>
            <PillRow icon="git-branch" tone="accent" label={b.name} sublabel="Hanya di GitHub" />
            <Button title="Hapus dari GitHub" variant="danger" onPress={() => handleDeleteRemote(b.name)} />
          </View>
        ))}
        <Button title="Fetch Ulang" variant="secondary" onPress={openSync} />
        </ScrollView>
      </View>
    );
  } else {
    content = (
      <View style={{ flex: 1 }}>
        <TopBar title="Branch" onBack={onBack} backLabel="Tutup" />
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
        <ErrorBanner message={error} />
        {branches.map((name) => (
          <PillRow
            key={name}
            icon="git-branch"
            tone={name === current ? 'accent' : 'default'}
            label={name === current ? `${name} (aktif)` : name}
            onPress={() => handleBranchTap(name)}
          />
        ))}
        <Button title="Buat Branch Baru" onPress={() => setMode('create')} />
        <Button title="Sync Branch" variant="secondary" onPress={openSync} />
        </ScrollView>
      </View>
    );
  }

  return (
    <>
      {content}
      <LoadingModal visible={busy} label={busyLabel} icon="git-branch" />
    </>
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
  },
});
