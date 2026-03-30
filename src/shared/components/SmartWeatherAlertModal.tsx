import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, FONT, SPACE, RADIUS } from '@/shared/utils/theme';

interface Props {
  visible: boolean;
  mm: number;
  onCancel: () => void;
  onContinueAnyway: () => void;
}

export function SmartWeatherAlertModal({ visible, mm, onCancel, onContinueAnyway }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.back}>
        <View style={s.sheet}>
          <Text style={s.tit}>Escudo climático</Text>
          <Text style={s.txt}>
            El pronóstico (ventanas 3h sumadas ≈ 4–6 h) indica lluvia acumulada de ~{mm.toFixed(1)} mm. Registrar
            aplicación química o fertilización ahora puede reducir efectividad por lavado pluvial.
          </Text>
          <TouchableOpacity style={s.btnPrimary} onPress={onCancel}>
            <Text style={s.btnPrimaryTxt}>Volver y elegir otro momento</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnGhost} onPress={onContinueAnyway}>
            <Text style={s.btnGhostTxt}>Registrar igualmente (mi decisión)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: SPACE.lg },
  sheet: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACE.lg },
  tit: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  txt: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: SPACE.md, lineHeight: 20 },
  btnPrimary: { marginTop: SPACE.lg, backgroundColor: COLORS.primary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
  btnPrimaryTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
  btnGhost: { marginTop: SPACE.sm, padding: SPACE.md, alignItems: 'center' },
  btnGhostTxt: { color: COLORS.textSecondary, fontSize: FONT.sizes.sm },
});
