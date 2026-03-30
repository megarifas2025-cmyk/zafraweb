import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RemoteImage } from '@/shared/components/RemoteImage';
import { Ionicons } from '@expo/vector-icons';
import type { BuyerNearbySupplier } from '@/shared/types';
import { FONT, RADIUS, SHADOW } from '@/shared/utils/theme';

const SLATE = '#0F172A';
const BLUE = '#1565C0';

type Props = {
  item: BuyerNearbySupplier;
  onOpen?: (supplier: BuyerNearbySupplier) => void;
  onRequest?: (supplier: BuyerNearbySupplier) => void;
};

export function NearbySupplierCard({ item, onOpen, onRequest }: Props) {
  const distanceKm = item.distance_m < 1000 ? '<1 km' : `${(item.distance_m / 1000).toFixed(1)} km`;
  return (
    <TouchableOpacity style={s.card} onPress={() => onOpen?.(item)} activeOpacity={0.92}>
      <View style={s.top}>
        {item.logo_url ? (
          <RemoteImage uri={item.logo_url} style={s.logo} resizeMode="cover" fallbackIcon="business-outline" fallbackIconSize={20} />
        ) : (
          <View style={s.logoFallback}>
            <Ionicons name={item.kind === 'company' ? 'business-outline' : 'storefront-outline'} size={20} color={BLUE} />
          </View>
        )}
        <View style={s.textCol}>
          <Text style={s.name} numberOfLines={2}>{item.display_name}</Text>
          <Text style={s.meta} numberOfLines={2}>{item.subtitle ?? (item.kind === 'company' ? 'Empresa lista para atender compras' : 'Agrotienda lista para abastecerte')}</Text>
        </View>
      </View>
      <View style={s.metricsRow}>
        <Text style={s.metric}>{distanceKm}</Text>
        <Text style={s.metric}>{item.available_items} item(s)</Text>
      </View>
      {onRequest ? (
        <TouchableOpacity style={s.cta} onPress={() => onRequest(item)} activeOpacity={0.88}>
          <Text style={s.ctaTxt}>Comprar o solicitar</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    width: 248,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...SHADOW.sm,
  },
  top: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  logo: { width: 48, height: 48, borderRadius: 16 },
  logoFallback: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  name: { color: SLATE, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.heavy, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: 0.3 },
  meta: { marginTop: 6, fontSize: FONT.sizes.xs, color: '#64748b', lineHeight: 16, fontWeight: FONT.weights.semibold },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  metric: { fontSize: FONT.sizes.xs, color: BLUE, fontWeight: FONT.weights.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  cta: {
    marginTop: 14,
    minHeight: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  ctaTxt: { color: BLUE, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.heavy, textTransform: 'uppercase', letterSpacing: 0.4 },
});
