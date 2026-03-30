import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { distanceMeters } from '@/shared/utils/geo';
import { evaluateArrivalRule, evaluateDepartureRule } from '@/shared/services/freightTrackingService';
import { FONT, RADIUS, SHADOW, SPACE } from '@/shared/utils/theme';
import { VENEZUELA_DEFAULT_COORD } from '@/shared/utils/venezuelaGeo';

type Coord = { latitude: number; longitude: number };
type DriverPoint = Coord & { accuracyM?: number | null };

type Props = {
  mode: 'driver' | 'viewer';
  routeTitle: string;
  routeSubtitle: string;
  origin?: Coord | null;
  destination?: Coord | null;
  trackedCoord?: Coord | null;
  trackedUpdatedLabel?: string;
  currentPhase: string;
  onPositionSample?: (point: DriverPoint) => Promise<void> | void;
  onDeparture?: (point: DriverPoint) => Promise<void> | void;
  onArrival?: (point: DriverPoint) => Promise<void> | void;
  actionLoading?: 'departure' | 'arrival' | null;
  lastSyncHint?: string | null;
  departureAlreadyReported?: boolean;
  arrivalAlreadyReported?: boolean;
};

const GEOFENCE_M = 200;

export function ShipmentTrackingCard({
  mode,
  routeTitle,
  routeSubtitle,
  origin,
  destination,
  trackedCoord,
  trackedUpdatedLabel,
  currentPhase,
  onPositionSample,
  onDeparture,
  onArrival,
  actionLoading = null,
  lastSyncHint,
  departureAlreadyReported = false,
  arrivalAlreadyReported = false,
}: Props) {
  const [perm, setPerm] = useState<'pending' | 'granted' | 'denied'>(mode === 'driver' ? 'pending' : 'granted');
  const [driverCoord, setDriverCoord] = useState<Coord | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const lastUploadAt = useRef<number>(0);
  const lastUploadCoord = useRef<Coord | null>(null);

  const displayCoord = mode === 'driver' ? driverCoord : trackedCoord ?? null;

  const region = useMemo(() => {
    const focus = displayCoord ?? destination ?? VENEZUELA_DEFAULT_COORD;
    const zoomTight = !!displayCoord || !!destination;
    return {
      latitude: focus.latitude,
      longitude: focus.longitude,
      latitudeDelta: zoomTight ? 0.045 : 2.5,
      longitudeDelta: zoomTight ? 0.045 : 2.5,
    };
  }, [displayCoord, destination]);

  useEffect(() => {
    if (mode !== 'driver') return;
    let sub: Location.LocationSubscription | null = null;
    let alive = true;

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (status !== 'granted') {
        setPerm('denied');
        return;
      }
      setPerm('granted');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!alive) return;
      const firstPoint = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? null,
      };
      setDriverCoord({ latitude: firstPoint.latitude, longitude: firstPoint.longitude });
      setAccuracyM(firstPoint.accuracyM);

      if (onPositionSample) {
        void onPositionSample(firstPoint);
        lastUploadAt.current = Date.now();
        lastUploadCoord.current = { latitude: firstPoint.latitude, longitude: firstPoint.longitude };
      }

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 7000 },
        (loc) => {
          const point = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracyM: loc.coords.accuracy ?? null,
          };
          setDriverCoord({ latitude: point.latitude, longitude: point.longitude });
          setAccuracyM(point.accuracyM);

          const now = Date.now();
          const moved = lastUploadCoord.current ? distanceMeters(lastUploadCoord.current, point) : 999;
          const shouldUpload = !!onPositionSample && (now - lastUploadAt.current > 20_000 || moved >= 60);
          if (shouldUpload) {
            void onPositionSample?.(point);
            lastUploadAt.current = now;
            lastUploadCoord.current = { latitude: point.latitude, longitude: point.longitude };
          }
        },
      );
    })();

    return () => {
      alive = false;
      sub?.remove();
    };
  }, [mode, onPositionSample]);

  const geofenceDistance = useMemo(() => {
    if (!displayCoord || !destination) return null;
    return distanceMeters(displayCoord, destination);
  }, [displayCoord, destination]);

  const originDistance = useMemo(() => {
    if (!driverCoord || !origin) return null;
    return distanceMeters(driverCoord, origin);
  }, [driverCoord, origin]);

  const departureRule = useMemo(
    () =>
      evaluateDepartureRule({
        point: driverCoord ? { latitude: driverCoord.latitude, longitude: driverCoord.longitude, accuracyM } : null,
        origin: origin ?? null,
        hasDeparture: departureAlreadyReported,
        hasArrival: arrivalAlreadyReported,
      }),
    [driverCoord, accuracyM, origin, departureAlreadyReported, arrivalAlreadyReported],
  );

  const arrivalRule = useMemo(
    () =>
      evaluateArrivalRule({
        point: driverCoord ? { latitude: driverCoord.latitude, longitude: driverCoord.longitude, accuracyM } : null,
        destination: destination ?? null,
        hasDeparture: departureAlreadyReported,
        hasArrival: arrivalAlreadyReported,
      }),
    [driverCoord, accuracyM, destination, departureAlreadyReported, arrivalAlreadyReported],
  );

  const handleAction = useCallback(
    async (kind: 'departure' | 'arrival') => {
      if (!driverCoord) {
        Alert.alert('GPS', 'Espera la señal de ubicación para registrar este evento.');
        return;
      }
      const point = { latitude: driverCoord.latitude, longitude: driverCoord.longitude, accuracyM };
      if (kind === 'departure') {
        if (!departureRule.allowed) {
          Alert.alert('Salida', departureRule.reason ?? 'Todavía no puedes marcar la salida.');
          return;
        }
        await onDeparture?.(point);
        return;
      }
      if (!arrivalRule.allowed) {
        Alert.alert('Llegada', arrivalRule.reason ?? 'Todavía no puedes marcar la llegada.');
        return;
      }
      await onArrival?.(point);
    },
    [driverCoord, accuracyM, onArrival, onDeparture, departureRule, arrivalRule],
  );

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>{mode === 'driver' ? 'Seguimiento del chofer' : 'Seguimiento de la carga'}</Text>
          <Text style={s.title}>{routeTitle}</Text>
          <Text style={s.sub}>{routeSubtitle}</Text>
        </View>
        <View style={s.phasePill}>
          <Text style={s.phaseTxt}>{currentPhase}</Text>
        </View>
      </View>

      <View style={s.mapWrap}>
        {perm === 'pending' ? (
          <View style={s.mapCenter}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={s.centerTxt}>Inicializando GPS…</Text>
          </View>
        ) : perm === 'denied' ? (
          <View style={s.mapCenter}>
            <Ionicons name="location-outline" size={34} color="#2563eb" />
            <Text style={s.centerTxt}>Activa ubicación para reportar salida, ruta y llegada.</Text>
          </View>
        ) : (
          <MapView style={StyleSheet.absoluteFill} region={region}>
            {destination ? (
              <>
                <Circle
                  center={destination}
                  radius={GEOFENCE_M}
                  strokeColor="rgba(37,99,235,0.55)"
                  fillColor="rgba(37,99,235,0.12)"
                  strokeWidth={2}
                />
                <Marker coordinate={destination}>
                  <View style={s.destPin}>
                    <Ionicons name="flag" size={14} color="#1e3a8a" />
                  </View>
                </Marker>
              </>
            ) : null}
            {origin ? (
              <>
                <Circle
                  center={origin}
                  radius={GEOFENCE_M}
                  strokeColor="rgba(16,185,129,0.55)"
                  fillColor="rgba(16,185,129,0.12)"
                  strokeWidth={2}
                />
                <Marker coordinate={origin}>
                  <View style={s.originPin}>
                    <Ionicons name="play" size={14} color="#047857" />
                  </View>
                </Marker>
              </>
            ) : null}
            {displayCoord ? (
              <Marker coordinate={displayCoord}>
                <View style={[s.livePin, mode === 'viewer' && s.livePinViewer]}>
                  <Ionicons name={mode === 'driver' ? 'car-outline' : 'cube-outline'} size={16} color="#fff" />
                </View>
              </Marker>
            ) : null}
          </MapView>
        )}
      </View>

      <View style={s.infoBox}>
        <Text style={s.infoLabel}>Estado operativo</Text>
        <Text style={s.infoValue}>{currentPhase}</Text>
        {trackedUpdatedLabel ? <Text style={s.infoMeta}>{trackedUpdatedLabel}</Text> : null}
        {lastSyncHint ? <Text style={s.infoMeta}>{lastSyncHint}</Text> : null}
        {geofenceDistance != null ? (
          <Text style={s.infoMeta}>
            {geofenceDistance <= GEOFENCE_M
              ? 'La carga está dentro del radio de destino.'
              : `Distancia al destino: ${Math.round(geofenceDistance)} m`}
          </Text>
        ) : null}
        {mode === 'driver' && originDistance != null && !departureAlreadyReported ? (
          <Text style={s.infoMeta}>
            {originDistance <= GEOFENCE_M
              ? 'Estás dentro del radio de origen para reportar salida.'
              : `Distancia al origen: ${Math.round(originDistance)} m`}
          </Text>
        ) : null}
      </View>

      {mode === 'driver' ? (
        <>
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.secondaryBtn, (!departureRule.allowed || actionLoading != null) && s.disabledBtn]}
              onPress={() => void handleAction('departure')}
              disabled={!departureRule.allowed || actionLoading != null}
            >
              {actionLoading === 'departure' ? <ActivityIndicator color="#1e3a8a" /> : <Text style={s.secondaryTxt}>Saliendo</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, (!arrivalRule.allowed || actionLoading != null) && s.disabledBtn]}
              onPress={() => void handleAction('arrival')}
              disabled={!arrivalRule.allowed || actionLoading != null}
            >
              {actionLoading === 'arrival' ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryTxt}>Llegué</Text>}
            </TouchableOpacity>
          </View>
          {!departureAlreadyReported && departureRule.reason ? <Text style={s.ruleHint}>{departureRule.reason}</Text> : null}
          {departureAlreadyReported && !arrivalAlreadyReported && arrivalRule.reason ? <Text style={s.ruleHint}>{arrivalRule.reason}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#dbeafe',
    ...SHADOW.md,
  },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: SPACE.sm },
  kicker: { fontSize: 10, fontWeight: '900', color: '#2563eb', textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { fontSize: FONT.sizes.lg, fontWeight: '900', color: '#0f172a', marginTop: 4, fontStyle: 'italic' },
  sub: { fontSize: FONT.sizes.sm, color: '#64748b', marginTop: 4, lineHeight: 18 },
  phasePill: { backgroundColor: '#eff6ff', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8 },
  phaseTxt: { fontSize: 10, fontWeight: '900', color: '#1d4ed8', textTransform: 'uppercase', textAlign: 'center' },
  mapWrap: { height: 220, borderRadius: 22, overflow: 'hidden', backgroundColor: '#e2e8f0', marginTop: SPACE.sm },
  mapCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.md },
  centerTxt: { marginTop: SPACE.sm, color: '#64748b', textAlign: 'center', fontWeight: '600' },
  destPin: { backgroundColor: '#fff', padding: 7, borderRadius: 12, borderWidth: 2, borderColor: '#1e3a8a' },
  originPin: { backgroundColor: '#fff', padding: 7, borderRadius: 12, borderWidth: 2, borderColor: '#047857' },
  livePin: { backgroundColor: '#2563eb', padding: 9, borderRadius: 16, borderWidth: 2, borderColor: '#fff' },
  livePinViewer: { backgroundColor: '#10b981' },
  infoBox: { marginTop: SPACE.md },
  infoLabel: { fontSize: 10, fontWeight: '900', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2 },
  infoValue: { fontSize: 16, fontWeight: '900', color: '#0f172a', marginTop: 4 },
  infoMeta: { fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 18, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: SPACE.md },
  secondaryBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  primaryBtn: {
    flex: 1,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e3a8a',
  },
  secondaryTxt: { color: '#1e3a8a', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  primaryTxt: { color: '#fff', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  disabledBtn: { opacity: 0.7 },
  ruleHint: { marginTop: SPACE.sm, fontSize: 12, color: '#64748b', lineHeight: 18, fontWeight: '600' },
});
