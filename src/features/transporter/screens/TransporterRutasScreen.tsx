import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Alert, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/shared/store/AuthContext';
import { ShipmentTrackingCard } from '@/shared/components/ShipmentTrackingCard';
import { fetchDestinoMapaParaFreight, fetchOrigenMapaParaFreight } from '@/shared/services/freightTrackingDestination';
import {
  listActiveFreightsForTransporter,
  listFreightTrackingUpdates,
  reportFreightTrackingEvent,
  subscribeToFreightTracking,
  syncFreightSignalStatus,
  trackingEventTitle,
  trackingEventTone,
  trackingPhaseLabel,
  trackingUpdatedLabel,
} from '@/shared/services/freightTrackingService';
import {
  hasFreightBackgroundTrackingStarted,
  requestBackgroundTrackingPermission,
  startFreightBackgroundTracking,
  stopFreightBackgroundTracking,
} from '@/shared/services/backgroundFreightTrackingService';
import { supabase } from '@/shared/lib/supabase';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import { freightTrackingStatusLabel } from '@/shared/services/freightRequestsService';
import { enqueueArrival, trySyncPending } from '@/shared/services/arrivalQueueService';
import type { FreightRequest, FreightTrackingUpdate } from '@/shared/types';

const TX = { navy: '#1E3A8A', blue: '#3B82F6' };

export default function TransporterRutasScreen() {
  const insets = useSafeAreaInsets();
  const { perfil } = useAuth();
  const [activeFreights, setActiveFreights] = useState<FreightRequest[]>([]);
  const [selectedFreightId, setSelectedFreightId] = useState<string | null>(null);
  const [latestTracking, setLatestTracking] = useState<FreightTrackingUpdate | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<FreightTrackingUpdate[]>([]);
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destination, setDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'departure' | 'arrival' | null>(null);
  const [backgroundState, setBackgroundState] = useState<'idle' | 'active' | 'denied' | 'error'>('idle');
  const [listRefreshing, setListRefreshing] = useState(false);
  const skipNextRutasFocusRef = useRef(true);
  /** Evita que `cargar` dependa de `selectedFreightId` (si no, cada `setSelectedFreightId` recrea `cargar` y el `useEffect` vuelve a poner loading → parpadeo). */
  const selectedFreightIdRef = useRef<string | null>(null);

  const activeFreight = useMemo(
    () => activeFreights.find((item) => item.id === selectedFreightId) ?? activeFreights[0] ?? null,
    [activeFreights, selectedFreightId],
  );

  useEffect(() => {
    selectedFreightIdRef.current = selectedFreightId;
  }, [selectedFreightId]);

  const cargar = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!perfil?.id) {
      setActiveFreights([]);
      setSelectedFreightId(null);
      selectedFreightIdRef.current = null;
      setLatestTracking(null);
      setTrackingEvents([]);
      setOrigin(null);
      setDestination(null);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const freights = await listActiveFreightsForTransporter(perfil.id);
      const sid = selectedFreightIdRef.current;
      const currentId = sid && freights.some((item) => item.id === sid) ? sid : freights[0]?.id ?? null;
      setSelectedFreightId(currentId);
      selectedFreightIdRef.current = currentId;
      const freight = freights.find((item) => item.id === currentId) ?? freights[0] ?? null;
      if (!freight) {
        setActiveFreights([]);
        setLatestTracking(null);
        setTrackingEvents([]);
        setOrigin(null);
        setDestination(null);
        return;
      }
      await syncFreightSignalStatus(freight.id).catch(() => undefined);
      // Re-fetch único después del sync para obtener el estado actualizado
      const refreshed = await listActiveFreightsForTransporter(perfil.id);
      setActiveFreights(refreshed);
      const syncedFreight = refreshed.find((item) => item.id === freight.id) ?? freight;
      const [events, originPoint, destPoint] = await Promise.all([
        listFreightTrackingUpdates(syncedFreight.id, 20),
        fetchOrigenMapaParaFreight(syncedFreight),
        fetchDestinoMapaParaFreight(syncedFreight),
      ]);
      setLatestTracking(events[0] ?? null);
      setTrackingEvents(events);
      setOrigin(originPoint ? { latitude: originPoint.latitude, longitude: originPoint.longitude } : null);
      setDestination(destPoint ? { latitude: destPoint.latitude, longitude: destPoint.longitude } : null);
    } catch (error: unknown) {
      Alert.alert('Rutas', error instanceof Error ? error.message : 'No se pudo cargar la ruta activa.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [perfil?.id]);

  useEffect(() => {
    if (!perfil?.id) return;
    void cargar();
  }, [perfil?.id, cargar]);

  useFocusEffect(
    useCallback(() => {
      if (!perfil?.id) return;
      if (skipNextRutasFocusRef.current) {
        skipNextRutasFocusRef.current = false;
        return;
      }
      void cargar({ silent: true });
    }, [perfil?.id, cargar]),
  );

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

  const hasDeparture = trackingEvents.some((item) => item.event_type === 'departed_origin');
  const hasArrival = trackingEvents.some((item) => item.event_type === 'arrived_destination');
  const routeStep2Label = hasArrival
    ? 'Completada'
    : hasDeparture
      ? activeFreight?.driver_has_app && activeFreight?.driver_has_gps
        ? 'GPS activo'
        : 'Seguimiento manual'
      : 'Pendiente';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!perfil?.id || !activeFreight?.id || !activeFreight.driver_has_app || !activeFreight.driver_has_gps || !hasDeparture || hasArrival) {
        await stopFreightBackgroundTracking();
        if (!cancelled) setBackgroundState('idle');
        return;
      }
      try {
        const granted = await requestBackgroundTrackingPermission();
        if (!granted) {
          if (!cancelled) setBackgroundState('denied');
          return;
        }
        await startFreightBackgroundTracking({
          freightRequestId: activeFreight.id,
          actorId: perfil.id,
          actorRole: perfil.rol,
          label: `${activeFreight.tipo_servicio} · ${activeFreight.origen_municipio}`,
        });
        const started = await hasFreightBackgroundTrackingStarted();
        if (!cancelled) setBackgroundState(started ? 'active' : 'error');
      } catch {
        if (!cancelled) setBackgroundState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [perfil?.id, perfil?.rol, activeFreight?.id, activeFreight?.driver_has_app, activeFreight?.driver_has_gps, activeFreight?.tipo_servicio, activeFreight?.origen_municipio, hasDeparture, hasArrival]);

  const reportEvent = useCallback(
    async (eventType: 'departed_origin' | 'location_ping' | 'arrived_destination', point: { latitude: number; longitude: number; accuracyM?: number | null }) => {
      if (!perfil?.id || !activeFreight) return;
      await reportFreightTrackingEvent({
        freightRequestId: activeFreight.id,
        actorId: perfil.id,
        actorRole: perfil.rol,
        eventType,
        point,
        label: `${activeFreight.tipo_servicio} · ${activeFreight.origen_municipio}`,
      });
      const synthetic: FreightTrackingUpdate = {
        id: `${Date.now()}`,
        freight_request_id: activeFreight.id,
        actor_id: perfil.id,
        actor_role: perfil.rol,
        event_type: eventType,
        lat: point.latitude,
        lng: point.longitude,
        accuracy_m: point.accuracyM ?? null,
        label: `${activeFreight.tipo_servicio} · ${activeFreight.origen_municipio}`,
        creado_en: new Date().toISOString(),
      };
      setTrackingEvents((prev) => [synthetic, ...prev.filter((item) => item.id !== synthetic.id)]);
      setLatestTracking(synthetic);
    },
    [perfil?.id, perfil?.rol, activeFreight],
  );

  const handleDeparture = useCallback(async (point: { latitude: number; longitude: number; accuracyM?: number | null }) => {
    setActionLoading('departure');
    try {
      await reportEvent('departed_origin', point);
      Alert.alert('Salida reportada', 'El cliente ya puede ver que la mercancía va saliendo.');
    } catch (error: unknown) {
      Alert.alert('Salida', error instanceof Error ? error.message : 'No se pudo reportar la salida.');
    } finally {
      setActionLoading(null);
    }
  }, [reportEvent]);

  const handleArrival = useCallback(async (point: { latitude: number; longitude: number; accuracyM?: number | null }) => {
    setActionLoading('arrival');
    try {
      await reportEvent('arrived_destination', point);
      await stopFreightBackgroundTracking();
      // Registrar en arrival_events para historial persistente
      if (perfil?.id) {
        const label = activeFreight
          ? `${activeFreight.tipo_servicio} → ${activeFreight.destino_municipio ?? activeFreight.origen_municipio}`
          : 'Llegada destino';
        await enqueueArrival(perfil.id, {
          lat: point.latitude,
          lng: point.longitude,
          label,
          role: 'transporte',
        });
        void trySyncPending(perfil.id);
      }
      Alert.alert('Llegada reportada', 'El cliente recibió la señal de que la mercancía llegó al destino.');
    } catch (error: unknown) {
      Alert.alert('Llegada', error instanceof Error ? error.message : 'No se pudo reportar la llegada.');
    } finally {
      setActionLoading(null);
    }
  }, [reportEvent, perfil?.id, activeFreight]);

  const captureCurrentPoint = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Debes permitir ubicación para registrar salida o llegada manual.');
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracyM: pos.coords.accuracy ?? null,
    };
  }, []);

  const handleManualDeparture = useCallback(async () => {
    try {
      const point = await captureCurrentPoint();
      await handleDeparture(point);
    } catch (error: unknown) {
      Alert.alert('Salida manual', error instanceof Error ? error.message : 'No se pudo registrar la salida manual.');
    }
  }, [captureCurrentPoint, handleDeparture]);

  const handleManualArrival = useCallback(async () => {
    try {
      const point = await captureCurrentPoint();
      await handleArrival(point);
    } catch (error: unknown) {
      Alert.alert('Llegada manual', error instanceof Error ? error.message : 'No se pudo registrar la llegada manual.');
    }
  }, [captureCurrentPoint, handleArrival]);

  const onPullRefresh = useCallback(async () => {
    setListRefreshing(true);
    try {
      await cargar({ silent: true });
    } finally {
      setListRefreshing(false);
    }
  }, [cargar]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACE.sm, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={listRefreshing} onRefresh={() => void onPullRefresh()} tintColor={TX.blue} />}
    >
      <View style={styles.topBar}>
        <Text style={styles.topBarLabel}>Seguimiento de ruta</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.kicker}>Navegación</Text>
        <Text style={styles.title}>Rutas</Text>
        <Text style={styles.sub}>
          Aquí el chofer reporta salida, envía posición durante el trayecto y confirma llegada para que el cliente gane confianza.
        </Text>
      </View>
      {activeFreights.length > 1 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Servicios activos ({activeFreights.length})</Text>
          <Text style={styles.hintTxt}>
            Puedes tener varios servicios operativos, pero este dispositivo solo puede hacer tracking en segundo plano para el servicio seleccionado.
          </Text>
          {activeFreights.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.serviceCard, activeFreight?.id === item.id && styles.serviceCardOn]}
              onPress={() => {
                selectedFreightIdRef.current = item.id;
                setSelectedFreightId(item.id);
                void cargar({ silent: true });
              }}
              activeOpacity={0.88}
            >
              <Text style={styles.serviceTitle}>{item.tipo_servicio}</Text>
              <Text style={styles.serviceMeta}>
                {item.origen_municipio}, {item.origen_estado}
                {item.destino_municipio ? ` -> ${item.destino_municipio}` : ''}
              </Text>
              <Text style={styles.serviceMeta}>
                {item.driver_name ? `Chofer: ${item.driver_name}` : 'Chofer pendiente'} · {item.vehiculo_id ? 'vehículo listo' : 'vehículo pendiente'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={TX.blue} />
          <Text style={styles.loadingTxt}>Cargando ruta activa…</Text>
        </View>
      ) : activeFreight ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Chofer y unidad del viaje</Text>
            <Text style={styles.hintTxt}>
              {activeFreight.driver_name
                ? `${activeFreight.driver_name}${activeFreight.driver_phone ? ` · ${activeFreight.driver_phone}` : ''}`
                : 'Chofer pendiente de asignar'}
            </Text>
            <Text style={styles.hintTxt}>
              {activeFreight.vehiculo_id ? 'Vehículo operativo asignado.' : 'Vehículo operativo pendiente.'}
            </Text>
            <Text style={styles.hintTxt}>
              {activeFreight.driver_has_app && activeFreight.driver_has_gps
                ? 'Tracking en vivo habilitado para este servicio.'
                : 'Este servicio quedó en seguimiento manual porque el chofer no tiene app o GPS compatible.'}
            </Text>
            <Text style={styles.hintTxt}>Estado operativo: {freightTrackingStatusLabel(activeFreight.tracking_status)}</Text>
            {activeFreight.driver_has_app && activeFreight.driver_has_gps ? (
              <Text style={styles.hintTxt}>
                {backgroundState === 'active'
                  ? 'Segundo plano activo: la app seguirá reportando ubicación aunque el chofer salga de esta pantalla.'
                  : backgroundState === 'denied'
                    ? 'Falta permiso de ubicación en segundo plano. Sin ese permiso no habrá tracking 100% continuo.'
                    : backgroundState === 'error'
                      ? 'No se pudo iniciar el servicio en segundo plano. Revisa permisos y configuración Android.'
                      : 'Preparando tracking en segundo plano...'}
              </Text>
            ) : null}
          </View>
          {activeFreight.driver_name && activeFreight.vehiculo_id ? (
            activeFreight.driver_has_app && activeFreight.driver_has_gps ? (
              <ShipmentTrackingCard
                mode="driver"
                routeTitle={activeFreight.tipo_servicio}
                routeSubtitle={`${activeFreight.origen_municipio}, ${activeFreight.origen_estado}${activeFreight.destino_municipio ? ` -> ${activeFreight.destino_municipio}, ${activeFreight.destino_estado ?? ''}` : ''}`}
                origin={origin}
                destination={destination}
                currentPhase={trackingPhaseLabel(latestTracking)}
                trackedUpdatedLabel={trackingUpdatedLabel(latestTracking)}
                actionLoading={actionLoading}
                lastSyncHint="Cada actualización ayuda a que el cliente vea la mercancía en tiempo real."
                departureAlreadyReported={hasDeparture}
                arrivalAlreadyReported={hasArrival}
                onPositionSample={(point) => {
                  if (!hasDeparture || hasArrival) return;
                  return reportEvent('location_ping', point);
                }}
                onDeparture={handleDeparture}
                onArrival={handleArrival}
              />
            ) : (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Seguimiento manual</Text>
                <Text style={styles.hintTxt}>
                  Este viaje no enviará posición en vivo, pero igual puedes registrar salida y llegada para que el cliente vea los hitos del servicio.
                </Text>
                <View style={styles.manualActions}>
                  <TouchableOpacity
                    style={[styles.manualBtn, styles.manualBtnSoft, (hasDeparture || hasArrival || actionLoading != null) && styles.manualBtnDisabled]}
                    onPress={() => void handleManualDeparture()}
                    disabled={hasDeparture || hasArrival || actionLoading != null}
                    activeOpacity={0.88}
                  >
                    {actionLoading === 'departure' ? <ActivityIndicator color={TX.navy} /> : <Text style={styles.manualBtnSoftTxt}>Registrar salida</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.manualBtn, styles.manualBtnPrimary, (hasArrival || !hasDeparture || actionLoading != null) && styles.manualBtnDisabled]}
                    onPress={() => void handleManualArrival()}
                    disabled={hasArrival || !hasDeparture || actionLoading != null}
                    activeOpacity={0.88}
                  >
                    {actionLoading === 'arrival' ? <ActivityIndicator color="#fff" /> : <Text style={styles.manualBtnTxt}>Registrar llegada</Text>}
                  </TouchableOpacity>
                </View>
                {!hasDeparture ? <Text style={styles.hintTxt}>Primero registra la salida manual desde el punto de carga.</Text> : null}
                {hasDeparture && !hasArrival ? <Text style={styles.hintTxt}>Cuando entregues la carga, registra la llegada manual para habilitar el cierre del cliente.</Text> : null}
              </View>
            )
          ) : (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Servicio aún no preparado</Text>
              <Text style={styles.hintTxt}>
                Ve a la pestaña Flota y usa “Preparar servicio” para registrar vehículo y chofer antes de iniciar la ruta.
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Sin ruta asignada</Text>
          <Text style={styles.hintTxt}>
            Cuando una postulación sea aceptada, aquí aparecerán el mapa en vivo y los botones de confianza: saliendo y llegó.
          </Text>
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Bitácora del servicio</Text>
        {trackingEvents.length === 0 ? (
          <Text style={styles.hintTxt}>Todavía no hay eventos de tracking reportados para este servicio.</Text>
        ) : (
          trackingEvents.slice(0, 10).map((event) => (
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

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Hoja de ruta</Text>
        <View style={styles.stopCard}>
          <Text style={styles.stopStep}>01</Text>
          <View style={styles.stopBody}>
            <Text style={styles.stopTitle}>Salida informada</Text>
            <Text style={styles.stopMeta}>El chofer marca “Saliendo” y el cliente recibe una notificación inmediata.</Text>
          </View>
          <Text style={hasDeparture ? styles.stopStatusDone : styles.stopStatusPending}>
            {hasDeparture ? 'Confirmada' : 'Pendiente'}
          </Text>
        </View>
        <View style={styles.stopCard}>
          <Text style={styles.stopStep}>02</Text>
          <View style={styles.stopBody}>
            <Text style={styles.stopTitle}>Ruta en vivo</Text>
            <Text style={styles.stopMeta}>La posición reportada del transporte alimenta el mapa del cliente.</Text>
          </View>
          <Text style={hasDeparture && !hasArrival ? styles.stopStatusLive : hasArrival ? styles.stopStatusDone : styles.stopStatusPending}>
            {routeStep2Label}
          </Text>
        </View>
        <View style={styles.stopCard}>
          <Text style={styles.stopStep}>03</Text>
          <View style={styles.stopBody}>
            <Text style={styles.stopTitle}>Llegada confirmada</Text>
            <Text style={styles.stopMeta}>El botón “Llegué” cierra el hito de confianza frente al contratante.</Text>
          </View>
          <Text style={hasArrival ? styles.stopStatusDone : styles.stopStatusPending}>
            {hasArrival ? 'Confirmada' : 'Pendiente'}
          </Text>
        </View>
      </View>

      <View style={styles.hint}>
        <Text style={styles.hintTitle}>Qué hace esta vista</Text>
        <Text style={styles.hintTxt}>
          Aquí queda el seguimiento real del trayecto y sus hitos de confianza. La pestaña Flota sigue siendo el centro para
          disponibilidad, unidades y captación de carga, mientras el Radar te lleva directo a la pizarra.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDFBF7' },
  scroll: { paddingHorizontal: SPACE.md },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  topBarLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', color: TX.blue },
  card: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    ...SHADOW.sm,
    borderWidth: 1,
    borderColor: 'rgba(30,58,138,0.12)',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '900',
    color: TX.blue,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: { fontSize: FONT.sizes.xl, fontWeight: '900', color: COLORS.text, fontStyle: 'italic', marginTop: 4 },
  sub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20 },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbeafe',
    ...SHADOW.sm,
  },
  loadingTxt: { marginTop: 10, fontSize: FONT.sizes.sm, color: COLORS.textSecondary, fontWeight: '600' },
  panel: {
    marginTop: SPACE.md,
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#dbeafe',
    ...SHADOW.sm,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: TX.navy,
    marginBottom: SPACE.sm,
  },
  serviceCard: {
    backgroundColor: '#f8fafc',
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: SPACE.sm,
  },
  serviceCardOn: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  serviceTitle: { fontSize: FONT.sizes.sm, fontWeight: '900', color: COLORS.text },
  serviceMeta: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 4, lineHeight: 18 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  logDot: { width: 10, height: 10, borderRadius: 5 },
  logTitle: { fontSize: FONT.sizes.sm, fontWeight: '800', color: COLORS.text },
  logMeta: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  manualActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm, marginBottom: SPACE.xs },
  manualBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  manualBtnSoft: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  manualBtnPrimary: { backgroundColor: TX.navy },
  manualBtnDisabled: { opacity: 0.65 },
  manualBtnSoftTxt: { color: TX.navy, fontSize: FONT.sizes.sm, fontWeight: '900' },
  manualBtnTxt: { color: '#fff', fontSize: FONT.sizes.sm, fontWeight: '900' },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stopStep: {
    width: 34,
    fontSize: 12,
    fontWeight: '900',
    color: TX.blue,
    textAlign: 'center',
  },
  stopBody: { flex: 1, marginHorizontal: SPACE.sm },
  stopTitle: { fontSize: FONT.sizes.sm, fontWeight: '800', color: COLORS.text },
  stopMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16 },
  stopStatusDone: { color: '#059669', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  stopStatusLive: { color: TX.blue, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  stopStatusPending: { color: '#94a3b8', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  hint: {
    marginTop: SPACE.sm,
    padding: SPACE.sm,
    backgroundColor: '#F1F5F9',
    borderRadius: RADIUS.md,
    ...Platform.select({ ios: {}, android: {} }),
  },
  hintTitle: { fontSize: 11, fontWeight: '900', color: TX.navy, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  hintTxt: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
});
