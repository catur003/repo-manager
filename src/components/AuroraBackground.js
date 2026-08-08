/**
 * AuroraBackground.js
 * Latar "mesh gradient" animasi - diambil dari komponen yang sama di app
 * zenvps (components/AuroraBackground.tsx), diporting ke JS & disesuaikan
 * ke satu palet flat (COLORS.auroraColors) karena app ini belum multi-tema
 * (lihat dokumen konsep Bagian 10.11).
 *
 * Cuma pakai Animated bawaan React Native (tidak ada dependency native
 * tambahan), aman dipasang tanpa perlu prebuild ulang. Dipasang SEKALI di
 * root (App.js), bukan per-layar, biar animasinya tidak keulang dari awal
 * tiap pindah tab.
 *
 * CATATAN KONTRAS: wash penutup di bawah blob sengaja dibikin lebih pekat
 * (opacity 0.55, vs 0.22 di zenvps) supaya card & teks di atasnya tetap
 * kebaca jelas - app ini sempat ada laporan bug kontras jelek, jadi
 * legibility diprioritaskan di atas intensitas visual aurora.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { COLORS } from '../theme';

// PERF (8 Agustus 2026, laporan Zen "app lag"): tadinya 4 layer per blob x
// 4 blob = 16 View transparan yang di-composite TERUS MENERUS di root app
// (mounted sekali di App.js, jalan selama app dibuka, di semua layar).
// useNativeDriver:true bikin animasinya sendiri gak makan JS thread, TAPI
// tiap layer tetap butuh GPU nge-blend alpha overlap - di HP kelas
// menengah-bawah ini nambah beban render/overdraw yang konstan, ikut
// kerasa di scroll list berat (WorkingTreeScreen dkk) yang jalan
// BARENGAN aurora di belakangnya. Dipangkas ke 2 layer/blob (separuh
// draw call) - efek gradasi masih ada, cuma gak sehalus sebelumnya.
const LAYER_SCALES = [1, 0.46];
const LAYER_OPACITIES = [0.14, 0.3];

function Blob({ spec }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: spec.duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dir = spec.reverse ? -1 : 1;
  const translateX = progress.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0, spec.driftX * dir, -spec.driftX * 0.55 * dir, 0],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0, spec.driftY * dir, spec.driftY * 0.35 * dir, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [1, 1 + spec.growBy, 1 - spec.growBy * 0.45, 1],
  });

  return (
    <Animated.View
      style={[
        styles.blobWrap,
        spec.posStyle,
        { width: spec.size, height: spec.size, transform: [{ translateX }, { translateY }, { scale }] },
      ]}
    >
      {LAYER_SCALES.map((scaleFactor, i) => {
        const layerSize = spec.size * scaleFactor;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: layerSize,
              height: layerSize,
              left: (spec.size - layerSize) / 2,
              top: (spec.size - layerSize) / 2,
              borderRadius: layerSize / 2,
              backgroundColor: spec.color,
              opacity: LAYER_OPACITIES[i],
            }}
          />
        );
      })}
    </Animated.View>
  );
}

export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  const palette = COLORS.auroraColors;

  const blobs = useMemo(
    () => [
      { color: palette[0], size: width * 1.4, posStyle: { top: -height * 0.14, left: -width * 0.25 }, duration: 22000, driftX: 46, driftY: 64, growBy: 0.16 },
      { color: palette[1], size: width * 1.3, posStyle: { top: height * 0.14, right: -width * 0.3 }, duration: 28000, driftX: 62, driftY: 40, growBy: 0.13 },
      { color: palette[2], size: width * 1.5, posStyle: { bottom: -height * 0.2, left: -width * 0.12 }, duration: 34000, driftX: 32, driftY: 46, growBy: 0.2 },
      { color: palette[3], size: width * 1.15, posStyle: { bottom: height * 0.06, right: -width * 0.2 }, duration: 40000, driftX: 36, driftY: 28, growBy: 0.1, reverse: true },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {blobs.map((spec, i) => (
        <Blob key={i} spec={spec} />
      ))}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.bg, opacity: 0.55 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blobWrap: { position: 'absolute' },
});
