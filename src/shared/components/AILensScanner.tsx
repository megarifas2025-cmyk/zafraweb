/**
 * Escáner desactivado: la IA quedó reservada solo para S.O.S fitosanitario.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

interface Props {
  userMunicipio?: string | null | undefined;
  onResultados?: (_items: unknown[], _nombreIa: string) => void;
  onEscaneoListoParaAlta?: (_nombreDetectado: string) => void;
  /** Solo botón compacto (panel e-commerce); mismo flujo de escaneo. */
  compact?: boolean;
}

export function AILensScanner({ compact }: Props) {
  async function escanear() {
    Alert.alert('Escáner desactivado', 'La IA solo está habilitada en S.O.S fitosanitario.');
  }

  if (compact) {
    return (
      <TouchableOpacity
        style={s.compactBtn}
        onPress={escanear}
        activeOpacity={0.88}
        accessibilityLabel="Escáner desactivado"
      >
        <>
          <Ionicons name="scan-outline" size={14} color="#475569" />
          <Text style={s.compactTxt}>OFF</Text>
        </>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.titleRow}>
        <Ionicons name="scan-outline" size={20} color={COLORS.roles.agrotienda} />
        <Text style={s.title}>Escáner desactivado</Text>
      </View>
      <Text style={s.sub}>
        La IA fue reservada exclusivamente para S.O.S fitosanitario.
      </Text>
      <TouchableOpacity style={s.btn} onPress={escanear}>
        <Text style={s.btnTxt}>Ver aviso</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  compactTxt: { fontSize: 10, fontWeight: FONT.weights.heavy, color: '#475569', textTransform: 'uppercase' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACE.md,
    ...SHADOW.lg,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text, flex: 1 },
  sub: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 6, marginBottom: SPACE.sm },
  btn: {
    backgroundColor: COLORS.roles.agrotienda,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  btnTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
});
