import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Image, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BuyerNearbySupplier } from '@/shared/types';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  supplier: BuyerNearbySupplier | null;
  onRequestRequirement?: (supplier: BuyerNearbySupplier) => void;
  onRequestTransport?: (supplier: BuyerNearbySupplier) => void;
};

export function BuyerSupplierDetailModal({
  visible,
  onClose,
  supplier,
  onRequestRequirement,
  onRequestTransport,
}: Props) {
  const distanceLabel = supplier
    ? supplier.distance_m < 1000
      ? '<1 km'
      : `${(supplier.distance_m / 1000).toFixed(1)} km`
    : '';

  async function callSupplier() {
    if (!supplier?.phone) {
      Alert.alert('Proveedor', 'Este proveedor no tiene teléfono registrado.');
      return;
    }
    const url = `tel:${supplier.phone}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Proveedor', 'No se pudo abrir el marcador telefónico.');
      return;
    }
    await Linking.openURL(url);
  }

  return (
    <Modal visible={visible && !!supplier} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.header}>
          <Text style={s.title}>Aliado comercial cercano</Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Cerrar">
              <Ionicons name="close-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {supplier ? (
            <View style={s.body}>
              <View style={s.top}>
                {supplier.logo_url ? (
                  <Image source={{ uri: supplier.logo_url }} style={s.logo} resizeMode="cover" />
                ) : (
                  <View style={s.logoFallback}>
                    <Ionicons name={supplier.kind === 'company' ? 'business-outline' : 'storefront-outline'} size={26} color={COLORS.roles.buyer} />
                  </View>
                )}
                <View style={s.topText}>
                  <Text style={s.name}>{supplier.display_name}</Text>
                  <Text style={s.meta}>{supplier.subtitle ?? 'Proveedor registrado y listo para atender tu compra'}</Text>
                </View>
              </View>

              <View style={s.metricsCard}>
                <Text style={s.metricRow}>Tipo: {supplier.kind === 'company' ? 'Empresa' : 'Agrotienda'}</Text>
                <Text style={s.metricRow}>Distancia: {distanceLabel}</Text>
                <Text style={s.metricRow}>Opciones visibles: {supplier.available_items}</Text>
                <Text style={s.metricRow}>Teléfono: {supplier.phone ?? 'No registrado'}</Text>
              </View>

              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => supplier && onRequestRequirement?.(supplier)}
                activeOpacity={0.88}
              >
                <Text style={s.primaryBtnTxt}>Enviar demanda dirigida</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.secondaryBtn}
                onPress={() => supplier && onRequestTransport?.(supplier)}
                activeOpacity={0.88}
              >
                <Text style={s.secondaryBtnTxt}>Mover esta operación</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.ghostBtn} onPress={() => void callSupplier()} activeOpacity={0.88}>
                <Text style={s.ghostBtnTxt}>Hablar con proveedor</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: SPACE.xl,
    ...SHADOW.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: SPACE.md },
  top: { flexDirection: 'row', gap: SPACE.md, alignItems: 'center' },
  logo: { width: 64, height: 64, borderRadius: 20 },
  logoFallback: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  topText: { flex: 1, minWidth: 0 },
  name: { fontSize: FONT.sizes.lg, color: COLORS.text, fontWeight: FONT.weights.heavy, fontStyle: 'italic', textTransform: 'uppercase' },
  meta: { marginTop: 6, fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  metricsCard: {
    marginTop: SPACE.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricRow: { fontSize: FONT.sizes.sm, color: COLORS.text, fontWeight: FONT.weights.semibold, paddingVertical: 4 },
  primaryBtn: {
    marginTop: SPACE.md,
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.roles.buyer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  secondaryBtn: {
    marginTop: SPACE.sm,
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnTxt: { color: COLORS.roles.buyer, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  ghostBtn: {
    marginTop: SPACE.sm,
    minHeight: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnTxt: { color: COLORS.textSecondary, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
});
