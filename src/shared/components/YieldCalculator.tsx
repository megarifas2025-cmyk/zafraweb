import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

interface Props {
  defaultHectareas?: number;
  onSolicitarTransporte: (kgEstimado: number, nota: string) => void;
  onBuscarComprador: (kgEstimado: number, nota: string) => void;
}

export function YieldCalculator({ defaultHectareas, onSolicitarTransporte, onBuscarComprador }: Props) {
  const [ha, setHa] = useState(
    defaultHectareas != null && defaultHectareas > 0 ? String(defaultHectareas) : '',
  );
  const [rend, setRend] = useState('3500'); // kg/ha esperado

  useEffect(() => {
    if (defaultHectareas != null && defaultHectareas > 0 && ha === '') {
      setHa(String(defaultHectareas));
    }
  }, [defaultHectareas, ha]);

  const kgTotal = useMemo(() => {
    const h = Number.parseFloat(ha.replace(',', '.'));
    const r = Number.parseFloat(rend.replace(',', '.'));
    if (!Number.isFinite(h) || !Number.isFinite(r) || h <= 0 || r <= 0) return null;
    return Math.round(h * r);
  }, [ha, rend]);

  const nota = useMemo(() => {
    if (kgTotal == null) return '';
    return `Proyección: ${ha} ha × ${rend} kg/ha ≈ ${kgTotal.toLocaleString('es-VE')} kg`;
  }, [ha, rend, kgTotal]);

  return (
    <View style={s.card}>
      <Text style={s.title}>Calculadora de cosecha</Text>
      <Text style={s.label}>Hectáreas</Text>
      <TextInput style={s.input} value={ha} onChangeText={setHa} keyboardType="decimal-pad" placeholder="10" placeholderTextColor={COLORS.textDisabled} />
      <Text style={s.label}>Rendimiento esperado (kg/ha)</Text>
      <TextInput style={s.input} value={rend} onChangeText={setRend} keyboardType="decimal-pad" placeholder="3500" placeholderTextColor={COLORS.textDisabled} />
      {kgTotal != null ? (
        <Text style={s.result}>≈ {kgTotal.toLocaleString('es-VE')} kg proyectados</Text>
      ) : (
        <Text style={s.hint}>Indica hectáreas y rendimiento</Text>
      )}
      <TouchableOpacity
        style={[s.cta, !kgTotal && s.ctaOff]}
        disabled={!kgTotal}
        onPress={() => kgTotal && onSolicitarTransporte(kgTotal, nota)}
      >
        <Text style={s.ctaTxt}>🚚 Solicitar transporte con este volumen</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.cta2, !kgTotal && s.ctaOff]}
        disabled={!kgTotal}
        onPress={() => kgTotal && onBuscarComprador(kgTotal, nota)}
      >
        <Text style={s.cta2Txt}>🛒 Usar proyección para publicar cosecha</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.md, ...SHADOW.sm },
  title: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text, marginBottom: SPACE.sm },
  label: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: SPACE.xs },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACE.sm, marginTop: 4, color: COLORS.text },
  result: { marginTop: SPACE.sm, fontWeight: FONT.weights.bold, color: COLORS.primary },
  hint: { marginTop: SPACE.sm, fontSize: FONT.sizes.sm, color: COLORS.textDisabled },
  cta: { marginTop: SPACE.md, backgroundColor: '#1565C0', padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
  cta2: { marginTop: SPACE.sm, backgroundColor: COLORS.success, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center' },
  ctaOff: { opacity: 0.45 },
  ctaTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  cta2Txt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
});
