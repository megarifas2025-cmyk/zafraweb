import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { calificarCompradorDesdeSala } from '@/shared/services/ratingsService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  salaId: string | null;
  buyerName?: string | null;
  onSaved?: () => void;
};

const SCORES = [1, 2, 3, 4, 5] as const;

export function BuyerRatingModal({ visible, onClose, salaId, buyerName, onSaved }: Props) {
  const [score, setScore] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!salaId) return;
    setSaving(true);
    try {
      await calificarCompradorDesdeSala({
        salaId,
        puntaje: score,
        comentario: comment,
      });
      Alert.alert('Calificación guardada', 'La reputación del comprador fue actualizada con tu valoración.');
      setComment('');
      setScore(5);
      onSaved?.();
      onClose();
    } catch (error: unknown) {
      Alert.alert('Calificación', error instanceof Error ? error.message : 'No se pudo guardar la calificación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>Calificar comprador</Text>
          <Text style={s.sub}>{buyerName ? `Tu valoración para ${buyerName}` : 'Esta calificación impacta la reputación comercial del comprador.'}</Text>
          <View style={s.starsRow}>
            {SCORES.map((item) => (
              <TouchableOpacity key={item} style={[s.star, score === item && s.starOn]} onPress={() => setScore(item)} activeOpacity={0.88}>
                <Text style={[s.starTxt, score === item && s.starTxtOn]}>{item}★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={s.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Comentario opcional sobre seriedad, pago o comunicación"
            placeholderTextColor={COLORS.textDisabled}
            multiline
          />
          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} disabled={saving} activeOpacity={0.88}>
              <Text style={s.cancelTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={() => void guardar()} disabled={saving} activeOpacity={0.88}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveTxt}>Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: SPACE.lg },
  card: { backgroundColor: COLORS.background, borderRadius: 24, padding: SPACE.lg, ...SHADOW.lg },
  title: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.heavy, color: COLORS.text },
  sub: { marginTop: 8, fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  starsRow: { flexDirection: 'row', gap: 8, marginTop: SPACE.md, flexWrap: 'wrap' },
  star: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  starOn: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  starTxt: { color: COLORS.textSecondary, fontWeight: FONT.weights.bold },
  starTxtOn: { color: '#b45309' },
  input: {
    minHeight: 96,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    color: COLORS.text,
    marginTop: SPACE.md,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  cancelTxt: { color: COLORS.textSecondary, fontWeight: FONT.weights.bold },
  saveBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
  saveTxt: { color: '#fff', fontWeight: FONT.weights.bold },
});
