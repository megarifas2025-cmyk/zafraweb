import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Cosecha } from '@/shared/types';
import { tonsFromKg } from '@/shared/utils/geo';

const GREEN = '#0F3B25';
const SLATE = '#0F172A';

export interface BuyerOfferCardProps {
  item: Cosecha;
  distanceKm: number | null;
  onNegotiate: () => void;
  onFreight: () => void;
  /** Si se pasa, el nombre del productor es clicable y abre el perfil compartido. */
  onViewProducer?: () => void;
}

/** Tarjeta ancha mercado comprador — layout `perfil comprador.txt` */
export function BuyerOfferCard({
  item,
  distanceKm,
  onNegotiate,
  onFreight,
  onViewProducer,
}: BuyerOfferCardProps) {
  const perfil = item.perfil as { nombre?: string; reputacion?: number; trust_score?: number } | undefined;
  const prod = perfil?.nombre ?? item.finca?.nombre ?? 'Productor';
  const ts = perfil?.trust_score;
  const rep = typeof perfil?.reputacion === 'number' ? perfil.reputacion : null;
  const hasRating = (typeof ts === 'number' && ts > 0) || (rep != null && rep > 0);
  const rating =
    typeof ts === 'number' && ts > 0
      ? Math.min(5, ts / 20)
      : rep != null && rep > 0
        ? Math.min(5, rep)
        : null;
  const ratingLabel = rating != null ? rating.toFixed(1) : 'Sin calificar';
  const hum = item.pct_humedad != null ? `${Number(item.pct_humedad).toFixed(1)}%` : '—';
  const ton = tonsFromKg(Number(item.cantidad_kg));
  const dist =
    distanceKm !== null ? `${distanceKm < 1 ? '<1' : distanceKm.toFixed(1)} km` : 'Sin ubicación';
  const ubicacion = [item.municipio, item.estado_ve].filter(Boolean).join(', ');

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <View style={s.titleBlock}>
          <View style={s.iconBox}>
            <Ionicons name="leaf" size={26} color={GREEN} />
          </View>
          <View style={s.titleText}>
            <Text style={s.rubro} numberOfLines={2}>
              {item.rubro}
            </Text>
            <View style={s.metaRow}>
              <Text style={s.metaPill}>{ubicacion || 'Sin zona'}</Text>
              <Text style={s.metaPillSoft}>Mercado ciego</Text>
            </View>
            {item.variedad ? (
              <Text style={s.variedad} numberOfLines={1}>
                {item.variedad}
              </Text>
            ) : null}
            {onViewProducer ? (
              <TouchableOpacity
                style={s.prodRow}
                onPress={onViewProducer}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Ver perfil del productor"
              >
                <Text style={[s.prod, s.prodInRow]} numberOfLines={1}>
                  {prod}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
              </TouchableOpacity>
            ) : (
              <Text style={s.prod} numberOfLines={1}>
                {prod}
              </Text>
            )}
          </View>
        </View>
        <View style={s.starPill}>
          <Ionicons name={hasRating ? 'star' : 'star-outline'} size={12} color="#f59e0b" />
          <Text style={s.starTxt}>{ratingLabel}</Text>
        </View>
      </View>

      <View style={s.statsRow}>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Volumen</Text>
          <Text style={s.statVal}>{ton}</Text>
        </View>
        <View style={[s.statCell, s.statMid]}>
          <Text style={s.statLabel}>Humedad</Text>
          <Text style={[s.statVal, s.statHum]}>{hum}</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Distancia</Text>
          <Text style={s.statVal}>{dist}</Text>
        </View>
      </View>

      <Text style={s.blind}>Explora esta oportunidad, abre negociación con el vendedor y coordina transporte si decides comprar.</Text>

      <View style={s.actions}>
        <TouchableOpacity style={s.btnNegociar} onPress={onNegotiate} activeOpacity={0.9}>
          <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
          <Text style={s.btnNegociarTxt}>Abrir negociación</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnFlete} onPress={onFreight} activeOpacity={0.9} accessibilityLabel="Solicitar transporte">
          <Ionicons name="bus-outline" size={18} color="#1565C0" />
          <Text style={s.btnFleteTxt}>Mover compra</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 22,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  titleBlock: { flexDirection: 'row', gap: 14, flex: 1, minWidth: 0 },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 22,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: { flex: 1, minWidth: 0 },
  rubro: {
    fontSize: 17,
    fontWeight: '900',
    fontStyle: 'italic',
    color: SLATE,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  metaPill: {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    overflow: 'hidden',
  },
  metaPillSoft: {
    backgroundColor: '#f8fafc',
    color: '#64748b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    overflow: 'hidden',
  },
  variedad: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 4 },
  prodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'stretch',
    minHeight: 22,
  },
  prod: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  prodInRow: { marginTop: 0, flex: 1, minWidth: 0 },
  starPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  starTxt: { fontSize: 12, fontWeight: '900', color: '#b45309' },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f8fafc',
    paddingVertical: 16,
    marginBottom: 12,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#f8fafc' },
  statLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  statVal: { fontSize: 14, fontWeight: '900', color: SLATE },
  statHum: { color: '#2563eb' },
  blind: { fontSize: 11, color: '#64748b', marginBottom: 14, lineHeight: 18, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  btnNegociar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnNegociarTxt: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  btnFlete: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1565C0',
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  btnFleteTxt: {
    color: '#1565C0',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
  },
});
