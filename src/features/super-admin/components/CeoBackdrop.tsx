import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CEO_COLORS } from './ceoTheme';

export function CeoBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[CEO_COLORS.bg, CEO_COLORS.bgAlt, '#020617']} style={StyleSheet.absoluteFill} />
      <View style={[s.orb, s.orbTop]} />
      <View style={[s.orb, s.orbLeft]} />
      <View style={[s.orb, s.orbBottom]} />
      <View style={s.grid} />
    </View>
  );
}

const s = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.24,
  },
  orbTop: {
    width: 240,
    height: 240,
    right: -70,
    top: 10,
    backgroundColor: '#0ea5e9',
  },
  orbLeft: {
    width: 220,
    height: 220,
    left: -90,
    top: 180,
    backgroundColor: '#10b981',
  },
  orbBottom: {
    width: 260,
    height: 260,
    right: -120,
    bottom: 120,
    backgroundColor: '#a855f7',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.06,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
});
