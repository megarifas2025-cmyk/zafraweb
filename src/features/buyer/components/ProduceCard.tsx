import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RemoteImage } from '@/shared/components/RemoteImage';
import type { Cosecha } from '@/shared/types';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import { tonsFromKg } from '@/shared/utils/geo';

export interface ProduceCardProps {
  item: Cosecha;
  distanceKm: number | null;
  onNegotiate: () => void;
  onFreight: () => void;
}

export function ProduceCard({ item, distanceKm, onNegotiate, onFreight }: ProduceCardProps) {
  const perfil = item.perfil as { nombre?: string; trust_score?: number } | undefined;
  const trust = typeof perfil?.trust_score === 'number' ? perfil.trust_score : null;
  const topProducer = trust !== null && trust >= 70;
  const foto = item.fotos?.[0];

  return (
    <View style={s.card}>
      <View style={s.photoWrap}>
        {foto ? (
          <RemoteImage uri={foto} style={s.photo} resizeMode="cover" fallbackIcon="leaf-outline" />
        ) : (
          <View style={s.photoPlaceholder}>
            <Text style={s.photoPhTxt}>🌾</Text>
          </View>
        )}
        {topProducer && (
          <View style={s.trustBadge}>
            <Text style={s.trustBadgeTxt}>⭐ Top</Text>
          </View>
        )}
      </View>
      <Text style={s.rubro} numberOfLines={1}>
        {item.rubro}
      </Text>
      {item.variedad ? (
        <Text style={s.variedad} numberOfLines={1}>
          {item.variedad}
        </Text>
      ) : null}
      <Text style={s.vol}>{tonsFromKg(Number(item.cantidad_kg))} disponibles</Text>
      <Text style={s.loc} numberOfLines={2}>
        📍 {item.municipio}, {item.estado_ve}
      </Text>
      {distanceKm !== null ? (
        <Text style={s.dist}>A prox. {distanceKm < 1 ? '<1' : distanceKm.toFixed(0)} km de ti</Text>
      ) : (
        <Text style={s.distMuted}>📍 Ubicación de carga en negociación privada</Text>
      )}
      <Text style={s.blind}>Mercado ciego — sin precio público</Text>
      <View style={s.actions}>
        <TouchableOpacity style={s.btnPrimary} onPress={onNegotiate} activeOpacity={0.85}>
          <Text style={s.btnPrimaryTxt}>Negociar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={onFreight} activeOpacity={0.85}>
          <Text style={s.btnSecondaryTxt}>🚚 Flete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    margin: SPACE.xs,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACE.sm,
    maxWidth: '48%',
    ...SHADOW.md,
  },
  photoWrap: { position: 'relative', marginBottom: SPACE.xs },
  photo: { width: '100%', height: 96, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  photoPlaceholder: {
    width: '100%',
    height: 96,
    borderRadius: RADIUS.sm,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPhTxt: { fontSize: 36 },
  trustBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  trustBadgeTxt: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  rubro: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text },
  variedad: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary },
  vol: { fontSize: FONT.sizes.sm, color: COLORS.text, marginTop: 4, fontWeight: '600' },
  loc: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 4 },
  dist: { fontSize: FONT.sizes.xs, color: COLORS.roles.buyer, marginTop: 4, fontWeight: '600' },
  distMuted: { fontSize: FONT.sizes.xs, color: COLORS.textDisabled, marginTop: 4 },
  blind: { fontSize: 10, color: COLORS.textDisabled, marginTop: 6, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 6, marginTop: SPACE.sm },
  btnPrimary: {
    flex: 1,
    backgroundColor: COLORS.roles.buyer,
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnPrimaryTxt: { color: '#FFF', fontSize: FONT.sizes.xs, fontWeight: '700' },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.roles.buyer,
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnSecondaryTxt: { color: COLORS.roles.buyer, fontSize: FONT.sizes.xs, fontWeight: '700' },
});
