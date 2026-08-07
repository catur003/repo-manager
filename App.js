import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import 'react-native-get-random-values';

import { isLoggedIn, getUserProfile, getToken, clearToken } from './src/auth/authStore';
import { logActivity } from './src/logging/logger';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import RepoListScreen from './src/screens/RepoListScreen';
import LocalReposScreen from './src/screens/LocalReposScreen';
import CompareScreen from './src/screens/CompareScreen';
import { AuroraBackground } from './src/components/AuroraBackground';
import { TabBar } from './src/components/TabBar';
import { COLORS } from './src/theme';

export default function App() {
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
  const [token, setToken] = useState(null);

  const [tab, setTab] = useState('dashboard');
  const [compareRepo, setCompareRepo] = useState(null); // repo yang lagi di-compare, null = tidak ada overlay
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
    <View style={styles.root}>
      <StatusBar style="dark" />
      <AuroraBackground />

      <View style={styles.content}>
        {compareRepo ? (
          <CompareScreen repo={compareRepo} token={token} onBack={() => setCompareRepo(null)} />
        ) : tab === 'dashboard' ? (
          <DashboardScreen profile={profile} onLogout={handleLogout} refreshKey={refreshKey} />
        ) : tab === 'github' ? (
          <RepoListScreen token={token} onCloned={bumpRefresh} />
        ) : (
          <LocalReposScreen token={token} onOpenCompare={setCompareRepo} />
        )}
      </View>

      {!compareRepo && <TabBar active={tab} onChange={setTab} />}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1 },
});
