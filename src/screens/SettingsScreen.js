/**
 * SettingsScreen.js
 * Versi minimal dulu - cuma info akun + Logout, dipindah kesini dari
 * Dashboard (BUGFIX 7 Agustus 2026: Logout semestinya di tab Settings,
 * bukan nempel di Dashboard). Toggle-toggle lain (auto backup, konfirmasi
 * delete/force push, identitas commit, dst - lihat dokumen konsep Bagian
 * 4.9) menyusul di Fase 8, layar ini jadi fondasinya supaya tidak perlu
 * bongkar struktur tab lagi nanti.
 */

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Button, Card, SectionTitle } from '../components/UI';
import { COLORS, SPACING } from '../theme';

export default function SettingsScreen({ profile, onLogout }) {
  return (
    <View style={styles.container}>
      <SectionTitle>Akun</SectionTitle>
      <Card style={{ alignItems: 'center' }}>
        {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} /> : null}
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.login}>@{profile?.login}</Text>
      </Card>

      <Button title="Logout" onPress={onLogout} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, marginBottom: 10 },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.ink },
  login: { fontSize: 13, color: COLORS.inkMuted, marginTop: 2 },
});
