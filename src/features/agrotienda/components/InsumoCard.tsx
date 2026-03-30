import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RemoteImage } from '@/shared/components/RemoteImage';
import type { AgriculturalInput } from '@/shared/types';
import { COLORS, FONT, SPACE, SHADOW, RADIUS } from '@/shared/utils/theme';

const CAT_LABEL: Record<string, string> = {
  quimicos: 'Químicos',
  semillas: 'Semillas',
  maquinaria: 'Maquinaria',
};

function stockLabel(stock: number | null | undefined): { text: string; color: string; bg: string } | null {
  if (stock == null) return null;
  if (stock === 0) return { text: 'AGOTADO', color: '#b91c1c', bg: '#fef2f2' };
  if (stock <= 5) return { text: `${stock} uds · Stock bajo`, color: '#d97706', bg: '#fffbeb' };
  return { text: `${stock} uds`, color: '#15803d', bg: '#f0fdf4' };
}

interface Props {
  item: AgriculturalInput;
  /** Grid 2 columnas (panel e-commerce); layout vertical con imagen arriba. */
  variant?: 'list' | 'grid';
}

export function InsumoCard({ item, variant = 'list' }: Props) {
  const catLabel =
    item.linea_catalogo === 'repuestos'
      ? item.subcategoria ?? 'Repuesto'
      : CAT_LABEL[item.categoria] ?? item.categoria;
  const lineaLabel = item.linea_catalogo === 'repuestos' ? 'Repuestos' : 'Insumos';
  const stock = stockLabel(item.stock_actual);

  if (variant === 'grid') {
    return (
      <View style={g.card}>
        <View style={g.imgWrap}>
          {item.imagen_url ? (
            <RemoteImage uri={item.imagen_url} style={g.img} resizeMode="cover" fallbackIcon="cube-outline" />
          ) : (
            <View style={g.imgPlaceholder} />
          )}
          {!item.disponibilidad ? (
            <View style={g.pausaOverlay}>
              <Text style={g.pausaTxt}>{item.stock_actual === 0 ? 'Agotado' : 'Pausado'}</Text>
            </View>
          ) : null}
        </View>
        <View style={g.catPill}>
          <Text style={g.catPillTxt}>{lineaLabel}</Text>
        </View>
        <Text style={g.nombreGrid} numberOfLines={2}>
          {item.nombre_producto}
        </Text>
        <Text style={g.subcatGrid} numberOfLines={1}>{catLabel}</Text>
        {stock ? (
          <View style={[g.stockBadge, { backgroundColor: stock.bg }]}>
            <Text style={[g.stockTxt, { color: stock.color }]}>{stock.text}</Text>
          </View>
        ) : null}
        <View style={g.priceBlindRow}>
          <Text style={g.blindGrid}>Negociación por chat</Text>
          {item.disponibilidad ? (
            <View style={g.checkDot}>
              <Text style={g.checkTxt}>✓</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.top}>
        <Text style={s.nombre} numberOfLines={2}>
          {item.nombre_producto}
        </Text>
        <View style={[s.badge, item.disponibilidad ? s.badgeOn : s.badgeOff]}>
          <Text style={[s.badgeTxt, item.disponibilidad ? s.badgeTxtOn : s.badgeTxtOff]}>
            {item.stock_actual === 0 ? 'Agotado' : item.disponibilidad ? 'Disponible' : 'Pausado'}
          </Text>
        </View>
      </View>
      <Text style={s.cat}>{lineaLabel}</Text>
      <Text style={s.subcat}>{catLabel}</Text>
      {stock ? (
        <View style={[s.stockRow, { backgroundColor: stock.bg }]}>
          <Text style={[s.stockTxt, { color: stock.color }]}>📦 {stock.text}</Text>
        </View>
      ) : null}
      <Text style={s.blindText}>Sin precio público. La negociación se acuerda directamente con cada comprador.</Text>
      {item.descripcion ? (
        <Text style={s.desc} numberOfLines={2}>
          {item.descripcion}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    ...SHADOW.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.sm },
  nombre: {
    flex: 1,
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.bold,
    color: COLORS.text,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeOn: { backgroundColor: 'rgba(46, 125, 50, 0.12)' },
  badgeOff: { backgroundColor: COLORS.surfaceAlt },
  badgeTxt: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.semibold },
  badgeTxtOn: { color: COLORS.success },
  badgeTxtOff: { color: COLORS.textSecondary },
  cat: {
    marginTop: 6,
    fontSize: FONT.sizes.xs,
    color: COLORS.roles.agrotienda,
    fontWeight: FONT.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  subcat: { marginTop: 4, fontSize: FONT.sizes.sm, color: COLORS.text, fontWeight: FONT.weights.semibold },
  blindText: {
    marginTop: SPACE.sm,
    fontSize: FONT.sizes.sm,
    color: COLORS.roles.agrotienda,
    fontStyle: 'italic',
    fontWeight: FONT.weights.semibold,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: SPACE.xs,
    alignSelf: 'flex-start',
  },
  stockTxt: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold },
  desc: { marginTop: SPACE.sm, fontSize: FONT.sizes.sm, color: COLORS.textSecondary },
});

const g = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    ...SHADOW.sm,
  },
  imgWrap: {
    height: 90,
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, backgroundColor: '#F1F5F9' },
  pausaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausaTxt: {
    fontSize: 9,
    fontWeight: FONT.weights.heavy,
    color: COLORS.text,
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  catPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3E5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 6,
  },
  catPillTxt: {
    fontSize: 8,
    fontWeight: FONT.weights.heavy,
    color: COLORS.roles.agrotienda,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  nombreGrid: {
    fontSize: 12,
    fontWeight: FONT.weights.bold,
    color: COLORS.text,
    lineHeight: 16,
    minHeight: 32,
  },
  subcatGrid: { marginTop: 4, fontSize: 10, color: COLORS.textSecondary, fontWeight: FONT.weights.semibold },
  stockBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  stockTxt: { fontSize: 9, fontWeight: FONT.weights.bold },
  priceBlindRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 6,
  },
  blindGrid: { fontSize: 11, fontStyle: 'italic', color: COLORS.roles.agrotienda, fontWeight: FONT.weights.semibold },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(46, 125, 50, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46, 125, 50, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkTxt: { fontSize: 11, color: COLORS.success, fontWeight: FONT.weights.bold },
});
