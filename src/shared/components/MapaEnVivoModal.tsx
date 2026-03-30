import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/shared/lib/supabase';
import { COLORS, FONT, SPACE, SHADOW } from '@/shared/utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  freightRequestId: string | null;
  /** Nombre del transportista para mostrar en el mapa */
  transportistaNombre?: string | null;
  /** Destino estimado del flete */
  destinoMunicipio?: string | null;
}

interface TrackingPos {
  lat: number;
  lng: number;
  creado_en?: string;
}

export function MapaEnVivoModal({
  visible,
  onClose,
  freightRequestId,
  transportistaNombre,
  destinoMunicipio,
}: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [pos, setPos] = useState<TrackingPos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !freightRequestId) return undefined;

    setLoading(true);
    setPos(null);

    // Cargar última posición conocida
    void supabase
      .from('freight_tracking_updates')
      .select('lat, lng, creado_en')
      .eq('freight_request_id', freightRequestId)
      .order('creado_en', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0] as { lat: number; lng: number; creado_en: string } | undefined;
        if (row) {
          setPos({ lat: row.lat, lng: row.lng, creado_en: row.creado_en });
          setTimeout(() => {
            mapRef.current?.animateToRegion(
              { latitude: row.lat, longitude: row.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
              600,
            );
          }, 500);
        }
        setLoading(false);
      });

    // Suscripción realtime
    const channel = supabase
      .channel(`mapa-flete-${freightRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'freight_tracking_updates',
          filter: `freight_request_id=eq.${freightRequestId}`,
        },
        (payload) => {
          const row = payload.new as { lat: number; lng: number; creado_en: string };
          if (!row.lat || !row.lng) return;
          const newPos = { lat: row.lat, lng: row.lng, creado_en: row.creado_en };
          setPos(newPos);
          mapRef.current?.animateToRegion(
            { latitude: row.lat, longitude: row.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
            800,
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [visible, freightRequestId]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 16 : SPACE.md) }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={s.cerrar}>‹ Volver</Text>
          </TouchableOpacity>
          <View style={s.titleRow}>
            <Ionicons name="map-outline" size={18} color={COLORS.primary} />
            <Text style={s.title}>Ubicación en vivo</Text>
          </View>
          <View style={{ width: 72 }} />
        </View>

        {transportistaNombre || destinoMunicipio ? (
          <View style={s.infoBar}>
            {transportistaNombre ? (
              <Text style={s.infoTxt}>
                <Text style={s.infoLabel}>Transportista: </Text>
                {transportistaNombre}
              </Text>
            ) : null}
            {destinoMunicipio ? (
              <Text style={s.infoTxt}>
                <Text style={s.infoLabel}>Destino: </Text>
                {destinoMunicipio}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={s.mapWrap}>
          {loading ? (
            <View style={s.loadingOver}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={s.loadingTxt}>Buscando posición…</Text>
            </View>
          ) : null}

          {!pos && !loading ? (
            <View style={s.noPosFill}>
              <Ionicons name="locate-outline" size={40} color="#CBD5E1" />
              <Text style={s.noPosTitle}>Sin señal GPS aún</Text>
              <Text style={s.noPosDesc}>
                El transportista aún no ha enviado su posición. Esta pantalla se actualiza automáticamente.
              </Text>
            </View>
          ) : null}

          {pos ? (
            <MapView
              ref={mapRef}
              style={s.map}
              provider={PROVIDER_DEFAULT}
              initialRegion={{
                latitude: pos.lat,
                longitude: pos.lng,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }}
              showsUserLocation
              showsMyLocationButton={false}
            >
              <Marker
                coordinate={{ latitude: pos.lat, longitude: pos.lng }}
                title={transportistaNombre ?? 'Transportista'}
                description={pos.creado_en
                  ? `Actualizado ${new Date(pos.creado_en).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Posición reportada'}
                pinColor="#3B82F6"
              />
            </MapView>
          ) : null}
        </View>

        {pos ? (
          <View style={s.footer}>
            <Ionicons name="radio-button-on" size={12} color="#22c55e" />
            <Text style={s.footerTxt}>
              {'  '}En vivo · actualiza automáticamente
              {pos.creado_en
                ? ` · Última señal ${new Date(pos.creado_en).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.md,
    paddingBottom: SPACE.sm,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  cerrar: { color: COLORS.primary, fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.md, minWidth: 72 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  infoBar: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderBottomWidth: 1,
    borderColor: '#BFDBFE',
    gap: 4,
  },
  infoTxt: { fontSize: FONT.sizes.sm, color: COLORS.text },
  infoLabel: { fontWeight: FONT.weights.bold },
  mapWrap: { flex: 1, position: 'relative', backgroundColor: '#E2E8F0' },
  loadingOver: {
    position: 'absolute', zIndex: 10, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingTxt: { color: COLORS.textSecondary, fontSize: FONT.sizes.sm },
  noPosFill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACE.xl, gap: 12,
  },
  noPosTitle: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text },
  noPosDesc: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, textAlign: 'center' },
  map: { flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    ...SHADOW.sm,
  },
  footerTxt: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary },
});
