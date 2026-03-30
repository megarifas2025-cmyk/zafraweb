import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Perfil } from '@/shared/types';

/** Zafraclic V2 — `diseños/agricultor.txt` (verde profundo, crema, cabecera táctica) */
const CREAM = '#FDFBF7';
const SLATE = '#0F172A';
const FOREST = '#0F3B25';
const RING = 'rgba(15, 59, 37, 0.22)';

type Props = {
  perfil: Perfil | null;
  isVerificado: boolean;
  onBell?: () => void;
  onLogout?: () => void;
  showNotificationDot?: boolean;
};

/** Cabecera identidad productor — misma jerarquía que el mock del tablero (avatar + nombre + VZLA). */
export function ProducerIdentityHeader({ perfil, isVerificado, onBell, onLogout, showNotificationDot = false }: Props) {
  const insets = useSafeAreaInsets();
  const nombre = perfil?.nombre?.trim() || 'Productor';
  const estado = perfil?.estado_ve?.trim();
  const muni = perfil?.municipio?.trim();
  const loc = estado ? `${estado}, VZLA` : muni ? `${muni}, VZLA` : 'Venezuela';

  return (
    <View style={[s.wrap, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={s.left}>
        <View style={s.avatarRing}>
          {perfil?.avatar_url ? (
            <Image source={{ uri: perfil.avatar_url }} style={s.avatarImg} resizeMode="cover" />
          ) : (
            <View style={s.avatarPh}>
              <Text style={s.avatarLetter}>{nombre[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
          {isVerificado ? (
            <View style={s.verifiedDot}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          ) : null}
        </View>
        <View style={s.textCol}>
          <Text style={s.brand}>ZafraClic</Text>
          <Text style={s.name} numberOfLines={1}>
            {nombre}
          </Text>
          <View style={s.locRow}>
            <Ionicons name="location-outline" size={12} color={FOREST} />
            <Text style={s.locTxt} numberOfLines={1}>
              {loc}
            </Text>
          </View>
        </View>
      </View>
      <View style={s.actions}>
        {onBell ? (
          <TouchableOpacity style={s.iconBtn} onPress={onBell} accessibilityLabel="Notificaciones">
            <Ionicons name="notifications-outline" size={22} color="#64748b" />
            {showNotificationDot ? <View style={s.notifDot} /> : null}
          </TouchableOpacity>
        ) : null}
        {onLogout ? (
          <TouchableOpacity style={s.iconBtn} onPress={onLogout} accessibilityLabel="Cerrar sesión">
            <Ionicons name="log-out-outline" size={20} color="#f87171" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e5e4',
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 14 },
  avatarRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: RING,
    padding: 2,
    backgroundColor: '#fff',
    position: 'relative',
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: 22 },
  avatarPh: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: FOREST,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 20, fontWeight: '900' },
  verifiedDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: FOREST,
    borderWidth: 2,
    borderColor: CREAM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  brand: {
    fontSize: 9,
    fontWeight: '900',
    color: FOREST,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    color: SLATE,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  locTxt: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontStyle: 'italic',
    flex: 1,
  },
  actions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e5e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
