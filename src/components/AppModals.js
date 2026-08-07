/**
 * AppModals.js
 * Dua komponen:
 *  1. AppAlertHost + appAlert() - pengganti Alert.alert() bawaan RN yang
 *     kelihatan polos/gak konsisten sama tema app. Tombol beda warna
 *     jelas per fungsi (primary/danger/cancel), radius gede, gak nyatu
 *     sama background card (permintaan Zen: "border radius button
 *     berwarna sesuai tema tapi jangan nyatu warnanya").
 *  2. LoadingModal - popup loading bersih dengan vector icon (Feather) +
 *     spinner, pengganti tombol yang cuma ganti teks jadi "Memproses...".
 *
 * Pola appAlert() dipakai module-level singleton (bukan Context) supaya
 * bisa dipanggil dari mana saja tanpa perlu prop-drilling/hook di tiap
 * layar - persis cara kerja library toast/alert kebanyakan. AppAlertHost
 * dipasang SEKALI di root App.js.
 */

import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../theme';

let _showAlert = null;
let _pendingRequest = null;

/**
 * appAlert(title, message, buttons?)
 * buttons: [{ text, onPress?, style?: 'primary'|'danger'|'cancel' }]
 * Default 1 tombol "OK" kalau tidak diisi - sama seperti Alert.alert().
 */
export function appAlert(title, message, buttons = [{ text: 'OK', style: 'primary' }]) {
  if (_showAlert) _showAlert({ title, message, buttons });
}

export function AppAlertHost() {
  const [state, setState] = useState(null);
  const [visible, setVisible] = useState(false);

  // BUGFIX (7 Agustus 2026, laporan Zen): dulu alert baru langsung
  // ditampilkan di tick yang sama pas alert lama ditutup (mis. rename
  // Push Berhasil -> Pull ditawarin, atau delete confirm -> hasil
  // sukses) - Modal-nya kelihatan "ganti paksa"/nabrak, bukan transisi
  // mulus, karena animasi keluar Modal lama belum sempat selesai.
  // Sekarang: kalau ada alert lagi tampil, tutup dulu (biarin animasi
  // keluar jalan), baru buka yang baru abis jeda kecil.
  _showAlert = (next) => {
    if (visible) {
      _pendingRequest = next;
      setVisible(false);
      setTimeout(() => {
        setState(_pendingRequest);
        setVisible(true);
        _pendingRequest = null;
      }, 220);
      return;
    }
    setState(next);
    setVisible(true);
  };

  const close = () => setVisible(false);

  if (!state) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={styles.buttonsCol}>
            {state.buttons.map((b, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  close();
                  b.onPress?.();
                }}
                style={[
                  styles.btn,
                  b.style === 'danger'
                    ? styles.btnDanger
                    : b.style === 'cancel'
                    ? styles.btnCancel
                    : b.style === 'success'
                    ? styles.btnSuccess
                    : styles.btnPrimary,
                ]}
              >
                <Text style={[styles.btnText, b.style === 'cancel' && styles.btnTextCancel]}>{b.text}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** LoadingModal - overlay non-interaktif, dipasang di layar manapun yang
 * lagi proses (`visible`), gak nutup seluruh layar jadi blank kayak
 * ActivityIndicator full-screen - konten di belakang tetap kelihatan. */
export function LoadingModal({ visible, label = 'Memproses...', icon = 'loader' }) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={styles.loadingCard}>
          <View style={styles.loadingIconWrap}>
            <Feather name={icon} size={22} color={COLORS.accent} />
          </View>
          <ActivityIndicator color={COLORS.accent} style={{ marginVertical: SPACING.sm }} />
          <Text style={styles.loadingLabel}>{label}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(19,37,48,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
  },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 6 },
  message: { fontSize: 13, color: COLORS.inkMuted, lineHeight: 19, marginBottom: SPACING.md },
  buttonsCol: { gap: 8 },
  btn: {
    borderRadius: RADIUS.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnDanger: { backgroundColor: COLORS.red },
  btnSuccess: { backgroundColor: COLORS.green },
  btnCancel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.cardBorder },
  btnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  btnTextCancel: { color: COLORS.inkMuted },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl + SPACING.md,
    alignItems: 'center',
  },
  loadingIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLabel: { fontSize: 13, fontWeight: '700', color: COLORS.ink, marginTop: 2 },
});
