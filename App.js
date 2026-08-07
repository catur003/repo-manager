import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import 'react-native-get-random-values';

import { isLoggedIn, getUserProfile, getToken, clearToken } from './src/auth/authStore';
import { logActivity } from './src/logging/logger';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import RepoListScreen from './src/screens/RepoListScreen';
import LocalReposScreen from './src/screens/LocalReposScreen';
import CompareScreen from './src/screens/CompareScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import StorageManagerScreen from './src/screens/StorageManagerScreen';
import UploadScreen from './src/screens/UploadScreen';
import WorkingTreeScreen from './src/screens/WorkingTreeScreen';
import { AuroraBackground } from './src/components/AuroraBackground';
import { TabBar } from './src/components/TabBar';
import { AppAlertHost } from './src/components/AppModals';
import { COLORS } from './src/theme';

// BUGFIX (7 Agustus 2026): sebelumnya tidak ada SafeAreaProvider sama
// sekali, jadi konten nempel langsung di bawah status bar (kayak "gak ada
// navbar" karena kepotong) dan TabBar cuma pakai padding statis (bisa
// kepotong home indicator di HP tanpa tombol fisik). export default cuma
// bungkus provider - AppShell yang pakai insets, karena hook useSafeAreaInsets
// wajib dipanggil DI DALAM SafeAreaProvider.
export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

function AppShell() {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
  const [token, setToken] = useState(null);

  const [tab, setTab] = useState('dashboard');
  const [compareRepo, setCompareRepo] = useState(null); // repo yang lagi di-compare, null = tidak ada overlay
  const [storageManagerOpen, setStorageManagerOpen] = useState(false);
  const [uploadRepo, setUploadRepo] = useState(null); // repo yang lagi dibuka buat Upload, null = tidak ada overlay
  const [workingTreeRepo, setWorkingTreeRepo] = useState(null); // repo yang lagi dibuka buat Working Tree/Commit
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      const loggedIn = await isLoggedIn();
      if (loggedIn) {
        const [p, t] = await Promise.all([getUserProfile(), getToken()]);
        setProfile(p);
        setToken(t);
      }
      setChecking(false);
    })();
  }, []);

  const handleLoggedIn = async (p) => {
    setProfile(p);
    setToken(await getToken());
  };

  const handleLogout = async () => {
    await clearToken();
    await logActivity('Logout');
    setProfile(null);
    setToken(null);
    setTab('dashboard');
    setCompareRepo(null);
    setStorageManagerOpen(false);
    setUploadRepo(null);
    setWorkingTreeRepo(null);
  };

  // Dipanggil setelah clone sukses, supaya tab Local Repos & Dashboard
  // langsung ke-refresh tanpa perlu logic subscribe/state-sharing rumit -
  // cukup naikkan angka ini, komponen yang butuh refresh dengarkan lewat prop.
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <>
        <StatusBar style="dark" />
        <LoginScreen onLoggedIn={handleLoggedIn} />
      </>
    );
  }

  return (
    // insets.top di sini yang bikin konten tidak mepet ke status bar
    // (BUGFIX item "gada navbar jadi terlalu ke atas").
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <AuroraBackground />
      <AppAlertHost />

      <View style={styles.content}>
        {compareRepo ? (
          <CompareScreen
            repo={compareRepo}
            token={token}
            author={{ name: profile.name, email: profile.email }}
            onBack={() => setCompareRepo(null)}
            onOpenWorkingTree={(r) => {
              setCompareRepo(null);
              setWorkingTreeRepo(r);
            }}
          />
        ) : storageManagerOpen ? (
          <StorageManagerScreen onBack={() => setStorageManagerOpen(false)} />
        ) : uploadRepo ? (
          <UploadScreen repo={uploadRepo} onBack={() => setUploadRepo(null)} />
        ) : workingTreeRepo ? (
          <WorkingTreeScreen repo={workingTreeRepo} author={{ name: profile.name, email: profile.email }} onBack={() => setWorkingTreeRepo(null)} />
        ) : tab === 'dashboard' ? (
          <DashboardScreen
            profile={profile}
            refreshKey={refreshKey}
            onNavigateTab={setTab}
            onOpenCompare={setCompareRepo}
            onOpenStorageManager={() => setStorageManagerOpen(true)}
            onOpenUpload={setUploadRepo}
            onOpenWorkingTree={setWorkingTreeRepo}
          />
        ) : tab === 'github' ? (
          <RepoListScreen token={token} onCloned={bumpRefresh} />
        ) : tab === 'local' ? (
          <LocalReposScreen token={token} onOpenCompare={setCompareRepo} onOpenUpload={setUploadRepo} onOpenWorkingTree={setWorkingTreeRepo} />
        ) : (
          <SettingsScreen profile={profile} onLogout={handleLogout} onOpenStorageManager={() => setStorageManagerOpen(true)} />
        )}
      </View>

      {/* insets.bottom diteruskan supaya tab bar tidak kepotong home
          indicator (iOS) / gesture bar (Android) di HP tanpa tombol fisik. */}
      {!compareRepo && !storageManagerOpen && !uploadRepo && !workingTreeRepo && <TabBar active={tab} onChange={setTab} bottomInset={insets.bottom} />}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1 },
});
