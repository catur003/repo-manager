import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Button, Card, COLORS } from '../components/UI';

export default function HomeScreen({ profile, onLogout }) {
  return (
    <View style={styles.container}>
      <Card style={{ alignItems: 'center' }}>
        {profile?.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
        ) : null}
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.login}>@{profile?.login}</Text>
      </Card>

      <Card>
        <Text style={styles.title}>Fase 0 selesai ✓</Text>
        <Text style={styles.desc}>
          Login, penyimpanan token aman, dan sistem log sudah jalan.{'\n'}
          Fase 1 (Repository Core: browse repo, clone, dashboard) menyusul.
        </Text>
      </Card>

      <Button title="Logout" onPress={onLogout} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, justifyContent: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 10 },
  name: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  login: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  desc: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },
});
