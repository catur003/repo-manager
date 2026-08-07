import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { Button, Card, StatusBadge, SectionTitle } from '../components/UI';
import { COLORS, SPACING } from '../theme';
import { getActiveRepo, listLocalRepos } from '../git/localRepos';
import { getWorkingTreeStatus } from '../git/compareRepository';

export default function DashboardScreen({ profile, onLogout, refreshKey }) {
  const [active, setActive] = useState(null);
  const [status, setStatus] = useState('unknown');
  const [repoCount, setRepoCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, list] = await Promise.all([getActiveRepo(), listLocalRepos()]);
    setActive(a);
    setRepoCount(list.length);
    if (a) {
      const s = await getWorkingTreeStatus(a.dir).catch(() => 'unknown');
      setStatus(s);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <View style={styles.container}>
      <Card style={{ alignItems: 'center' }}>
        {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} /> : null}
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.login}>@{profile?.login}</Text>
      </Card>

      <SectionTitle>Repo Aktif</SectionTitle>
      <Card>
        {loading ? (
          <ActivityIndicator color={COLORS.accent} />
        ) : active ? (
          <>
            <Text style={styles.repoName}>{active.fullName}</Text>
            <Text style={styles.repoMeta}>Branch: {active.defaultBranch}</Text>
            <View style={{ marginTop: SPACING.sm }}>
              <StatusBadge status={status} />
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>
            Belum ada repo aktif. Buka tab "Local Repos" lalu tap "Gunakan" pada salah satu repo, atau clone repo baru dari tab "GitHub Repos".
          </Text>
        )}
      </Card>

      <Text style={styles.summary}>{repoCount} repo tersimpan di HP ini.</Text>

      <Button title="Logout" onPress={onLogout} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, marginBottom: 10 },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.ink },
  login: { fontSize: 13, color: COLORS.inkMuted, marginTop: 2 },
  repoName: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  repoMeta: { fontSize: 12, color: COLORS.inkMuted, marginTop: 4 },
  emptyText: { fontSize: 13, color: COLORS.inkMuted, lineHeight: 19 },
  summary: { fontSize: 12, color: COLORS.inkFaint, textAlign: 'center', marginTop: 4, marginBottom: SPACING.sm },
});
