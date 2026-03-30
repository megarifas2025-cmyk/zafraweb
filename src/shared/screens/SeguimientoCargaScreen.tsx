import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { supabase } from '@/shared/lib/supabase';
import { ShipmentTrackingCard } from '@/shared/components/ShipmentTrackingCard';
import { fetchDestinoMapaParaFreight, fetchOrigenMapaParaFreight } from '@/shared/services/freightTrackingDestination';
import {
  listActiveFreightsForRequester,
  listFreightTrackingUpdates,
  subscribeToFreightTracking,
  syncFreightSignalStatus,
  trackingEventTitle,
  trackingEventTone,
  trackingPhaseLabel,
  trackingUpdatedLabel,
} from '@/shared/services/freightTrackingService';
import { freightTrackingStatusLabel, marcarFreightCompletado } from '@/shared/services/freightRequestsService';
import { COLORS, FONT, SPACE } from '@/shared/utils/theme';
import type { FreightRequest, FreightTrackingUpdate } from '@/shared/types';

const CREAM = '#FDFBF7';
const TRACKING_LOAD_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function SeguimientoCargaScreen() {
  const insets = useSafeAreaInsets();
  const { perfil } = useAuth();
  const [activeFreights, setActiveFreights] = useState<FreightRequest[]>([]);
  const [selectedFreightId, setSelectedFreightId] = useState<string | null>(null);
  const [latestTracking, setLatestTracking] = useState<FreightTrackingUpdate | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<FreightTrackingUpdate[]>([]);
  const [mapOrigin, setMapOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapDestination, setMapDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destinoMapaTxt, setDestinoMapaTxt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  const activeFreight = useMemo(
    () => activeFreights.find((item) => item.id === selectedFreightId) ?? activeFreights[0] ?? null,
    [activeFreights, selectedFreightId],
  );

  const loadTracking = useCallback(async () => {
    if (!perfil?.id) {
      setActiveFreights([]);
      setSelectedFreightId(null);
      setLatestTracking(null);
      setTrackingEvents([]);
      setMapOrigin(null);
      setMapDestination(null);
      setDestinoMapaTxt(null);
      setLoading(false);
      return;
    }
    try {
      let freights = await withTimeout(
        listActiveFreightsForRequester(perfil.id).catch(() => [] as FreightRequest[]),
        [] as FreightRequest[],
        TRACKING_LOAD_MS,
      );
      const currentId = selectedFreightId && freights.some((item) => item.id === selectedFreightId) ? selectedFreightId : freights[0]?.id ?? null;
      setSelectedFreightId(currentId);
      const freight = freights.find((item) => item.id === currentId) ?? freights[0] ?? null;
      if (!freight) {
        setActiveFreights([]);
        setLatestTracking(null);
        setTrackingEvents([]);
        setMapOrigin(null);
        setMapDestination(null);
        setDestinoMapaTxt(null);
        return;
      }
      await syncFreightSignalStatus(freight.id).catch(() => undefined);
      freights = await withTimeout(
        listActiveFreightsForRequester(perfil.id).catch(() => [] as FreightRequest[]),
        [] as FreightRequest[],
        TRACKING_LOAD_MS,
      );
      setActiveFreights(freights);
      const syncedFreight = freights.find((item) => item.id === freight.id) ?? freight;
      const [events, origin, dest] = await Promise.all([
        withTimeout(listFreightTrackingUpdates(syncedFreight.id, 20).catch(() => [] as FreightTrackingUpdate[]), [] as FreightTrackingUpdate[], TRACKING_LOAD_MS),
        withTimeout(fetchOrigenMapaParaFreight(syncedFreight).catch(() => null), null, TRACKING_LOAD_MS),
        withTimeout(fetchDestinoMapaParaFreight(syncedFreight).catch(() => null), null, TRACKING_LOAD_MS),
      ]);
      setTrackingEvents(events);
      setLatestTracking(events[0] ?? null);
      setMapOrigin(origin ? { latitude: origin.latitude, longitude: origin.longitude } : null);
      if (dest) {
        setMapDestination({ latitude: dest.latitude, longitude: dest.longitude });
        setDestinoMapaTxt(dest.label);
      } else {
        setMapOrigin(origin ? { latitude: origin.latitude, longitude: origin.longitude } : null);
        setMapDestination(null);
        setDestinoMapaTxt(null);
      }
    } catch {
      setActiveFreights([]);
      setSelectedFreightId(null);
      setLatestTracking(null);
      setTrackingEvents([]);
      setMapOrigin(null);
      setMapDestination(null);
      setDestinoMapaTxt(null);
    } finally {
      setLoading(false);
    }
  }, [perfil?.id, selectedFreightId]);

  useEffect(() => {
    setLoading(true);
    void loadTracking();
  }, [loadTracking]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadTracking();
    } finally {
      setRefreshing(false);
    }
  }, [loadTracking]);

  useEffect(() => {
    if (!activeFreight?.id) return;
    const channel = subscribeToFreightTracking(activeFreight.id, (row) => {
      setTrackingEvents((prev) => [row, ...prev.filter((item) => item.id !== row.id)].sort((a, b) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime()));
      setLatestTracking((prev) => {
        if (!prev) return row;
        return new Date(row.creado_en).getTime() >= new Date(prev.creado_en).getTime() ? row : prev;
      });
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeFreight?.id]);

  const canConfirmReception = activeFreight?.estado === 'asignada' && latestTracking?.event_type === 'arrived_destination';

  const confirmReception = useCallback(async () => {
    if (!perfil?.id || !activeFreight?.id) return;
    setClosing(true);
    try {
      await marcarFreightCompletado(perfil.id, activeFreight.id);
      Alert.alert('Recepción confirmada', 'El viaje quedó cerrado para tu operación.');
      await loadTracking();
    } catch (error: unknown) {
      Alert.alert('Recepción', error instanceof Error ? error.message : 'No se pudo cerrar el viaje.');
    } finally {
      setClosing(false);
    }
  }, [perfil?.id, activeFreight?.id, loadTracking]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACE.sm }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={COLORS.primary} />}
      >
        <Text style={styles.kicker}>Seguimiento</Text>
        <Text style={styles.title}>Seguimiento de mi carga</Text>
        <Text style={styles.sub}>
          Esta vista muestra la mercancía asignada, el último reporte del chofer y los hitos de confianza del viaje.
          Desliza hacia abajo para refrescar si notas demora.
        </Text>
        {activeFreights.length > 1 ? (
          <View style={styles.servicesWrap}>
            <Text style={styles.sectionTitle}>Servicios activos ({activeFreights.length})</Text>
            {activeFreights.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.serviceCard, activeFreight?.id === item.id && styles.serviceCardOn]}
                onPress={() => setSelectedFreightId(item.id)}
                activeOpacity={0.88}
              >
                <Text style={styles.serviceTitle}>{item.tipo_servicio}</Text>
                <Text style={styles.serviceMeta}>
                  {item.origen_municipio}, {item.origen_estado}
                  {item.destino_municipio ? ` -> ${item.destino_municipio}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {loading ? (
          <Text style={styles.emptyTxt}>Cargando seguimiento…</Text>
        ) : activeFreight ? (
          <>
            <View style={styles.tripCard}>
              <Text style={styles.tripTitle}>Operación asignada</Text>
              <Text style={styles.tripMeta}>
                {activeFreight.driver_name
                  ? `${activeFreight.driver_name}${activeFreight.driver_phone ? ` · ${activeFreight.driver_phone}` : ''}`
                  : 'Chofer pendiente de registrar'}
              </Text>
              <Text style={styles.tripMeta}>
                {activeFreight.driver_has_app && activeFreight.driver_has_gps
                  ? 'Modo: tracking en vivo'
                  : 'Modo: seguimiento manual visible'}
              </Text>
              <Text style={styles.tripMeta}>Fase: {trackingPhaseLabel(latestTracking)}</Text>
              <Text style={styles.tripMeta}>Estado operativo: {freightTrackingStatusLabel(activeFreight.tracking_status)}</Text>
            </View>
            {destinoMapaTxt ? <Text style={styles.destinoHint}>{destinoMapaTxt}</Text> : null}
            {activeFreight.driver_has_app && activeFreight.driver_has_gps ? (
              <ShipmentTrackingCard
                mode="viewer"
                routeTitle={activeFreight.tipo_servicio}
                routeSubtitle={`${activeFreight.origen_municipio}, ${activeFreight.origen_estado}${activeFreight.destino_municipio ? ` -> ${activeFreight.destino_municipio}, ${activeFreight.destino_estado ?? ''}` : ''}`}
                origin={mapOrigin}
                destination={mapDestination}
                trackedCoord={latestTracking ? { latitude: latestTracking.lat, longitude: latestTracking.lng } : null}
                trackedUpdatedLabel={trackingUpdatedLabel(latestTracking)}
                currentPhase={trackingPhaseLabel(latestTracking)}
              />
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Seguimiento manual</Text>
                <Text style={styles.emptyTxt}>
                  El servicio fue preparado sin app o GPS compatible. Verás el estado operativo, pero no posición en tiempo real.
                </Text>
              </View>
            )}
            {canConfirmReception ? (
              <TouchableOpacity style={[styles.confirmBtn, closing && styles.confirmBtnDisabled]} onPress={() => void confirmReception()} disabled={closing} activeOpacity={0.88}>
                {closing ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnTxt}>Confirmar recepción y cerrar viaje</Text>}
              </TouchableOpacity>
            ) : null}
            <View style={styles.logCard}>
              <Text style={styles.sectionTitle}>Bitácora del servicio</Text>
              {trackingEvents.length === 0 ? (
                <Text style={styles.emptyTxt}>Todavía no hay eventos de tracking reportados.</Text>
              ) : (
                trackingEvents.slice(0, 8).map((event) => (
                  <View key={event.id} style={styles.logRow}>
                    <View style={[styles.logDot, { backgroundColor: trackingEventTone(event.event_type) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logTitle}>{trackingEventTitle(event.event_type)}</Text>
                      <Text style={styles.logMeta}>{new Date(event.creado_en).toLocaleString()}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sin flete asignado en seguimiento</Text>
            <Text style={styles.emptyTxt}>
              Cuando una solicitud de transporte quede asignada, aquí verás salida, ubicación reportada y llegada.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scroll: { paddingHorizontal: SPACE.md },
  kicker: {
    fontSize: FONT.sizes.xs,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 8,
    marginBottom: SPACE.sm,
    fontSize: FONT.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    fontWeight: '600',
  },
  servicesWrap: { marginBottom: SPACE.md },
  sectionTitle: { fontSize: FONT.sizes.sm, fontWeight: '900', color: COLORS.text, marginBottom: SPACE.sm },
  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: SPACE.sm,
  },
  serviceCardOn: {
    borderColor: COLORS.primary,
    backgroundColor: '#f0fdf4',
  },
  serviceTitle: { fontSize: FONT.sizes.sm, fontWeight: '900', color: COLORS.text },
  serviceMeta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },
  destinoHint: {
    fontSize: FONT.sizes.xs,
    color: COLORS.primary,
    fontWeight: '700',
    marginBottom: SPACE.sm,
    lineHeight: 18,
  },
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: SPACE.sm,
  },
  tripTitle: { fontSize: FONT.sizes.sm, fontWeight: '900', color: COLORS.text, marginBottom: 6 },
  tripMeta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  confirmBtn: {
    marginTop: SPACE.md,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  confirmBtnDisabled: { opacity: 0.7 },
  confirmBtnTxt: { color: '#fff', fontSize: FONT.sizes.sm, fontWeight: '900', textAlign: 'center' },
  logCard: {
    marginTop: SPACE.md,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: 8 },
  logDot: { width: 10, height: 10, borderRadius: 5 },
  logTitle: { fontSize: FONT.sizes.sm, fontWeight: '800', color: COLORS.text },
  logMeta: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: SPACE.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: FONT.sizes.md, fontWeight: '900', color: COLORS.text, marginBottom: 8 },
  emptyTxt: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
});
