import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { requestDeviceCode, pollForToken, fetchGithubProfile, AuthError } from '../auth/githubAuth';
import { saveToken, saveUserProfile } from '../auth/authStore';
import { logError } from '../logging/logger';
import { Button, Card, ErrorBanner } from '../components/UI';
import { AuroraBackground } from '../components/AuroraBackground';
import { COLORS } from '../theme';

export default function LoginScreen({ onLoggedIn }) {
  const [step, setStep] = useState('idle'); // idle | code | polling | error
  const [userCode, setUserCode] = useState('');
  const [verificationUri, setVerificationUri] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const cancelRef = useRef(false);

  const startLogin = async () => {
    setError('');
    setStep('code');
    try {
      const device = await requestDeviceCode();
      setUserCode(device.userCode);
      setVerificationUri(device.verificationUri);
      cancelRef.current = false;

      // Buka browser otomatis ke halaman device login.
      Linking.openURL(device.verificationUriComplete || device.verificationUri).catch(() => {});

      setStep('polling');
      const token = await pollForToken(
        device.deviceCode,
        device.interval,
        device.expiresIn,
        (left) => {
          if (!cancelRef.current) setSecondsLeft(left);
        }
      );

      const profile = await fetchGithubProfile(token);
      await saveToken(token);
      await saveUserProfile(profile);
      onLoggedIn(profile);
    } catch (e) {
      cancelRef.current = true;
      if (e instanceof AuthError) {
        setError(e.message);
      } else {
        await logError('Login flow gagal tak terduga', e?.message);
        setError('Terjadi kesalahan tak terduga saat login. Coba lagi.');
      }
      setStep('error');
    }
  };

  const copyCode = async () => {
    await Clipboard.setStringAsync(userCode);
  };

  return (
    <View style={styles.root}>
      <AuroraBackground />
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.title}>Kelola repo GitHub{'\n'}langsung dari HP</Text>
          <Text style={styles.subtitle}>Clone, commit, branch, push, pull — tanpa laptop.</Text>
        </View>

        <Card>
          <ErrorBanner message={error} />

          {step === 'idle' || step === 'error' ? (
            <Button title="Login dengan GitHub" onPress={startLogin} />
          ) : null}

          {(step === 'code' || step === 'polling') && (
            <View>
              <Text style={styles.label}>Buka halaman ini di browser:</Text>
              <Text style={styles.uri}>{verificationUri || 'github.com/login/device'}</Text>

              <Text style={styles.label}>Masukkan kode ini:</Text>
              <Text style={styles.code}>{userCode || '......'}</Text>
              <Button title="Salin Kode" onPress={copyCode} variant="secondary" disabled={!userCode} />

              {step === 'polling' && (
                <Text style={styles.waiting}>
                  Menunggu approve... ({Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')})
                </Text>
              )}
            </View>
          )}
        </Card>

        <Text style={styles.note}>
          Login pakai akun GitHub kamu sendiri. Token disimpan aman cuma di HP ini, tidak pernah dikirim ke server manapun selain GitHub.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  hero: { marginBottom: 28, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.ink, textAlign: 'center', lineHeight: 32 },
  subtitle: { fontSize: 14, color: COLORS.inkMuted, marginTop: 8, textAlign: 'center' },
  label: { color: COLORS.inkMuted, fontSize: 13, marginTop: 10, marginBottom: 4 },
  uri: { color: COLORS.accent, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  code: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 4,
    color: COLORS.ink,
    textAlign: 'center',
    backgroundColor: COLORS.accentSoft,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  waiting: { textAlign: 'center', color: COLORS.inkMuted, marginTop: 10, fontSize: 13 },
  note: { fontSize: 11.5, color: COLORS.inkMuted, textAlign: 'center', marginTop: 20, lineHeight: 17 },
});
