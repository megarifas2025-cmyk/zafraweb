import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import type { AuthNav } from '@/features/auth/navigation/authTypes';
import { ZafraclicShieldLogo } from '@/features/auth/components/ZafraclicShieldLogo';
import { useAuth } from '@/shared/store/AuthContext';

const APP_VERSION: string = (Constants.expoConfig?.version ?? '1.0.1') as string;

const LOGO_SIZE = 168;

/** `nuevo diseño.txt` — acceso móvil oscuro */
const DARK_BG = '#03110A';
const BTN_PRIMARY = '#1F7A4C';
const YELLOW_DIM = 'rgba(234, 179, 8, 0.9)';

export default function WelcomeScreen() {
  const nav = useNavigation<AuthNav>();
  const { bootMessage, clearBootMessage } = useAuth();

  return (
    <View style={s.root}>
      <StatusBar style="light" backgroundColor={DARK_BG} translucent={false} />
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.inner}>
          <View style={s.centerBlock}>
            <View style={s.logoGlow} />
            <View style={s.logoWrap}>
              <ZafraclicShieldLogo size={LOGO_SIZE} />
            </View>

            <View style={s.tagBlock}>
              <Text style={s.tagGold}>Uniendo esfuerzos</Text>
              <View style={s.goldLine} />
              <Text style={s.tagSub}>
                Conectando la fuerza de la <Text style={s.tagSubStrong}>agricultura venezolana</Text>
              </Text>
            </View>
          </View>

          <View style={s.ctaCluster}>
            {bootMessage ? (
              <TouchableOpacity style={s.warnBox} onPress={clearBootMessage} activeOpacity={0.85}>
                <Text style={s.warnTxt}>{bootMessage}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.btnPrimary} onPress={() => nav.navigate('Register')} activeOpacity={0.95}>
              <Text style={s.btnPrimaryTxt}>Crear nueva cuenta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnGhost} onPress={() => nav.navigate('Login')} activeOpacity={0.95}>
              <Text style={s.btnGhostTxt}>Iniciar Sesión</Text>
            </TouchableOpacity>
          </View>

          <View style={s.legal}>
            <Text style={s.copyright}>© 2026 ZafraClic</Text>
            <Text style={s.rights}>Todos los derechos reservados</Text>
            <Text style={s.version}>v{APP_VERSION}</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK_BG },
  safe: { flex: 1 },
  inner: {
    flex: 1,
    maxWidth: 448,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 12,
  },
  centerBlock: { alignItems: 'center', marginTop: 4 },
  logoGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(74, 222, 128, 0.06)',
    top: 10,
  },
  logoWrap: { marginTop: 4, marginBottom: 4 },
  tagBlock: { alignItems: 'center', marginTop: 8, marginBottom: 8, paddingHorizontal: 16 },
  tagGold: {
    color: YELLOW_DIM,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 8,
    fontStyle: 'italic',
  },
  goldLine: { height: 2, width: 80, backgroundColor: 'rgba(234, 179, 8, 0.2)', borderRadius: 999, marginVertical: 12 },
  tagSub: {
    color: 'rgba(168, 162, 158, 0.85)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 4,
    textAlign: 'center',
    lineHeight: 16,
    fontStyle: 'italic',
    opacity: 0.7,
  },
  tagSubStrong: { color: '#e7e5e4', fontWeight: '900' },
  ctaCluster: { gap: 12, marginBottom: 8 },
  warnBox: {
    backgroundColor: 'rgba(127, 29, 29, 0.32)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(254, 202, 202, 0.18)',
  },
  warnTxt: { color: '#fecaca', fontSize: 12, lineHeight: 18, textAlign: 'center', fontWeight: '700' },
  btnPrimary: {
    backgroundColor: BTN_PRIMARY,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#052e16',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  btnPrimaryTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 4,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnGhostTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  legal: { alignItems: 'center', marginTop: 12, marginBottom: 8 },
  copyright: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(187, 247, 208, 0.45)',
    letterSpacing: 0.5,
  },
  rights: {
    fontSize: 7,
    fontWeight: '700',
    color: '#78716c',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
    opacity: 0.4,
    marginTop: 4,
  },
  version: {
    fontSize: 8,
    fontWeight: '900',
    color: 'rgba(187, 247, 208, 0.2)',
    textTransform: 'uppercase',
    letterSpacing: 3,
    marginTop: 6,
  },
});
