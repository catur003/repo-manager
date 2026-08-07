import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import 'react-native-get-random-values';

import { isLoggedIn, getUserProfile, clearToken } from './src/auth/authStore';
import { logActivity } from './src/logging/logger';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { COLORS } from './src/components/UI';

export default function App() {
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    (async () => {
      const loggedIn = await isLoggedIn();
      if (loggedIn) {
        const p = await getUserProfile();
        setProfile(p);
      }
      setChecking(false);
    })();
  }, []);

  const handleLoggedIn = (p) => setProfile(p);

  const handleLogout = async () => {
    await clearToken();
    await logActivity('Logout');
    setProfile(null);
  };

  if (checking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.sky} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {profile ? (
        <HomeScreen profile={profile} onLogout={handleLogout} />
      ) : (
        <LoginScreen onLoggedIn={handleLoggedIn} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
});
