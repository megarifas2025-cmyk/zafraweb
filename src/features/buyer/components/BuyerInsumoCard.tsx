import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AgriculturalInput } from '@/shared/types';
import { FONT, SHADOW } from '@/shared/utils/theme';

const SLATE = '#0F172A';
const EMERALD = '#059669';
const ACCENT = '#1565C0';

const CAT_LABEL: Record<string, string> = {
  quimicos: 'Químicos',
  semillas: 'Semillas',
  maquinaria: 'Maquinaria',
};

export interface BuyerInsumoCardProps {
  item: AgriculturalInput;
  onChat?: (item: AgriculturalInput) => void;
  /** @deprecated use onChat */
  onRequest?: (item: AgriculturalInput) => void;
  isFavorito?: boolean;
  onToggleFavorito?: (item: AgriculturalInput) => void;
}

/** Tarjeta insumo mercado comprador — agrotiendas nacionales */
export function BuyerInsumoCard({ item, onChat, onRequest, isFavorito, onToggleFavorito }: BuyerInsumoCardProps) {
  const handleChat = onChat ?? onRequest;
  const lineLabel = item.linea_catalogo === 'repuestos' ? 'Repuestos' : 'Insumos';
  const detailLabel = item.linea_catalogo === 'repuestos' ? item.subcategoria ?? 'General' : CAT_LABEL[item.categoria] ?? item.categoria;
  return (
    <View style={s.card}>
      <View style={s.top}>
        <View style={s.iconBox}>
          <Ionicons name="flask-outline" size={24} color={ACCENT} />
        </View>
        <View style={s.textCol}>
          <Text style={s.nombre} numberOfLines={2}>
            {item.nombre_producto}
          </Text>
          <Text style={s.cat}>{lineLabel}</Text>
          <Text style={s.subcat}>{detailLabel}</Text>
        </View>
        <View style={s.rightTop}>
          {onToggleFavorito ? (
            <TouchableOpacity
              onPress={() => onToggleFavorito(item)}
              hitSlop={8}
              style={s.favBtn}
            >
              <Ionicons
                name={isFavorito ? 'heart' : 'heart-outline'}
                size={20}
                color={isFavorito ? '#e11d48' : '#94a3b8'}
              />
            </TouchableOpacity>
          ) : null}
          <View style={[s.badge, item.disponibilidad ? s.badgeOn : s.badgeOff]}>
            <Text style={[s.badgeTxt, item.disponibilidad ? s.badgeTxtOn : s.badgeTxtOff]}>
              {item.disponibilidad ? 'Stock' : 'Pausado'}
            </Text>
          </View>
        </View>
      </View>
      <Text style={s.sinPrecio}>Sin precio publicado. Consulta directamente con la agrotienda para negociar condiciones.</Text>
      {item.descripcion ? (
        <Text style={s.desc} numberOfLines={2}>
          {item.descripcion}
        </Text>
      ) : null}
      <View style={s.footer}>
        <Ionicons name="storefront-outline" size={14} color="#64748b" />
        <Text style={s.footerTxt}>Catálogo agrotienda activo</Text>
      </View>
      {handleChat && item.disponibilidad ? (
        <TouchableOpacity style={s.ctaBtn} onPress={() => handleChat(item)} activeOpacity={0.9}>
          <Ionicons name="chatbubble-outline" size={16} color="#7B1FA2" />
          <Text style={s.ctaTxt}>Consultar / Chatear</Text>
        </TouchableOpacity>
      ) : null}
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
    ...SHADOW.lg,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  rightTop: { alignItems: 'flex-end', gap: 6 },
  favBtn: { padding: 4 },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(21,101,192,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  nombre: {
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.heavy,
    fontStyle: 'italic',
    color: SLATE,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cat: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: FONT.weights.bold,
    color: EMERALD,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  subcat: { marginTop: 4, fontSize: 12, color: '#334155', fontWeight: FONT.weights.semibold },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeOn: { backgroundColor: 'rgba(5,150,105,0.12)' },
  badgeOff: { backgroundColor: '#f8fafc' },
  badgeTxt: { fontSize: FONT.sizes.xs, fontWeight: FONT.weights.bold },
  badgeTxtOn: { color: EMERALD },
  badgeTxtOff: { color: '#94a3b8' },
  sinPrecio: { marginTop: 12, fontSize: FONT.sizes.sm, color: '#64748b', fontStyle: 'italic' },
  desc: { marginTop: 8, fontSize: FONT.sizes.sm, color: '#64748b', lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f8fafc' },
  footerTxt: { fontSize: 9, fontWeight: FONT.weights.bold, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' },
  ctaBtn: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CE93D8',
    backgroundColor: '#F3E5F5',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  ctaTxt: { color: '#7B1FA2', fontSize: FONT.sizes.sm, fontWeight: FONT.weights.heavy, textTransform: 'uppercase', letterSpacing: 0.4 },
});
