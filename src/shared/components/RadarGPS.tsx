import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import MapView, { Marker, Circle, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/shared/store/AuthContext';
import { distanceMeters } from '@/shared/utils/geo';
import { enqueueArrival, trySyncPending, listPending, type RadarRole } from '@/shared/services/arrivalQueueService';
import { FONT, SPACE } from '@/shared/utils/theme';
import { VENEZUELA_DEFAULT_REGION } from '@/shared/utils/venezuelaGeo';

const GEOFENCE_M = 200;

const ACCENT: Record<RadarRole, { main: string; dark: string; cream: string }> = {
  transporte: { main: '#3B82F6', dark: '#1E3A8A', cream: '#FDFBF7' },
  empresa: { main: '#64748B', dark: '#0F172A', cream: '#FDFBF7' },
  productor: { main: '#10B981', dark: '#0F3B25', cream: '#FDFBF7' },
};

export type RadarGPSProps = {
  role: RadarRole;
  /** Texto inferior “En camino a: …”. */
  routeStatusLabel?: string;
  /** Destino para geocerca ~200 m (opcional). */
  destination?: { latitude: number; longitude: number };
  mapHeight?: number;
  /**
   * Transporte: geocerca de demostración (~200 m al norte del primer fix) + franja de lectura GPS.
   * El seguimiento en segundo plano real se activará en build APK (nativo).
   */
  transportDemo?: boolean;
  /** Mostrar botón «LLEGUÉ» (p. ej. solo productor/empresa; comprador/admin en solo lectura). */
  showLlegueButton?: boolean;
};

export function RadarGPS({
  role,
  routeStatusLabel = 'Ruta activa',
  destination,
  mapHeight = 220,
  transportDemo = false,
  showLlegueButton = true,
}: RadarGPSProps) {
  const { perfil } = useAuth();
  const accent = ACCENT[role];
  const [perm, setPerm] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [userCoord, setUserCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  /** Destino fijo de simulacro (una vez con primer GPS) — ~245 m al norte del usuario. */
  const [demoDestination, setDemoDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [region, setRegion] = useState<Region>({ ...VENEZUELA_DEFAULT_REGION });
  const [isOffline, setIsOffline] = useState(false);
  const [insideFence, setInsideFence] = useState(false);
  const [pendingN, setPendingN] = useState(0);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [lastFixAt, setLastFixAt] = useState<Date | null>(null);
  const prevInsideFence = useRef(false);

  const effectiveDestination = useMemo(() => {
    if (destination) return destination;
    if (transportDemo && demoDestination) return demoDestination;
    return null;
  }, [destination, transportDemo, demoDestination]);

  useEffect(() => {
    if (destination) setDemoDestination(null);
  }, [destination]);

  useEffect(() => {
    if (!transportDemo) setDemoDestination(null);
  }, [transportDemo]);

  useEffect(() => {
    const sub = NetInfo.addEventListener(s => {
      setIsOffline(s.isConnected === false || s.isInternetReachable === false);
    });
    return () => sub();
  }, []);

  useEffect(() => {
    void listPending().then(rows => setPendingN(rows.length));
  }, []);

  useEffect(() => {
    if (!perfil?.id) return;
    void (async () => {
      await trySyncPending(perfil.id);
      const rows = await listPending();
      setPendingN(rows.length);
    })();
  }, [perfil?.id, isOffline]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let alive = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!alive) return;
      if (status !== 'granted') {
        setPerm('denied');
        return;
      }
      setPerm('granted');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!alive) return;
      const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserCoord(c);
      setAccuracyM(pos.coords.accuracy ?? null);
      setLastFixAt(new Date());
      if (transportDemo && !destination) {
        setDemoDestination({
          latitude: c.latitude + 0.0022,
          longitude: c.longitude,
        });
      }
      const zoomTight = Boolean(destination || transportDemo);
      setRegion(r => ({
        ...r,
        latitude: c.latitude,
        longitude: c.longitude,
        latitudeDelta: zoomTight ? 0.045 : 2.5,
        longitudeDelta: zoomTight ? 0.045 : 2.5,
      }));

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 5000 },
        loc => {
          const u = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setUserCoord(u);
          if (typeof loc.coords.accuracy === 'number') setAccuracyM(loc.coords.accuracy);
          setLastFixAt(new Date());
        },
      );
    })();

    return () => {
      alive = false;
      sub?.remove();
    };
  }, [destination, transportDemo]);

  useEffect(() => {
    if (!userCoord || !effectiveDestination) {
      setInsideFence(false);
      return;
    }
    const d = distanceMeters(userCoord, effectiveDestination);
    const inside = d <= GEOFENCE_M;
    setInsideFence(inside);
    if (inside && !prevInsideFence.current) {
      Alert.alert(
        transportDemo ? 'Geocerca (simulacro)' : 'Destino cercano',
        transportDemo
          ? 'Entraste en el radio de 200 m del punto demo (bandera).'
          : 'Estás a menos de 200 m del punto de destino.',
      );
    }
    prevInsideFence.current = inside;
  }, [userCoord, effectiveDestination, transportDemo]);

  useEffect(() => {
    prevInsideFence.current = false;
  }, [effectiveDestination?.latitude, effectiveDestination?.longitude]);

  const onLlegue = useCallback(async () => {
    if (!perfil?.id) {
      Alert.alert('Sesión', 'Inicia sesión para registrar la llegada.');
      return;
    }
    if (!userCoord) {
      Alert.alert('GPS', 'Espera la señal de ubicación o revisa permisos.');
      return;
    }
    try {
      await enqueueArrival(perfil.id, {
        lat: userCoord.latitude,
        lng: userCoord.longitude,
        label: routeStatusLabel,
        role,
      });
      const n = await listPending();
      setPendingN(n.length);
      Alert.alert(
        'Llegada',
        isOffline
          ? 'Registro guardado en el dispositivo. Se sincronizará al recuperar conexión.'
          : 'Llegada registrada correctamente.',
      );
    } catch {
      Alert.alert('Error', 'No se pudo guardar el registro.');
    }
  }, [perfil?.id, userCoord, routeStatusLabel, role, isOffline]);

  return (
    <View style={[styles.wrap, { borderRadius: 34 }]}>
      {transportDemo ? (
        <View style={styles.demoTopBanner}>
          <Ionicons name="navigate-circle" size={22} color={accent.dark} />
          <View style={styles.demoTopTextCol}>
            <Text style={styles.demoTopTit}>Simulacro · geolocalización</Text>
            <Text style={styles.demoTopSub}>
              Verás tu posición, un círculo de 200 m y una bandera de destino demo. El seguimiento en segundo plano se activará al generar el APK.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.mapBox, { height: mapHeight }]}>
        {perm === 'pending' ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color={accent.main} />
            <Text style={styles.mapLoadingTxt}>Inicializando GPS…</Text>
            {transportDemo ? (
              <Text style={styles.mapLoadingHint}>Simulacro: al conceder ubicación aparece el mapa y la geocerca.</Text>
            ) : null}
          </View>
        ) : perm === 'denied' ? (
          <View style={styles.mapLoading}>
            <Ionicons name="location-outline" size={40} color={accent.main} />
            <Text style={styles.mapLoadingTxt}>
              {transportDemo ? 'Ubicación desactivada — sin mapa ni bandera demo' : 'Permite ubicación para el radar.'}
            </Text>
            {transportDemo ? (
              <>
                <Text style={styles.mapLoadingHint}>
                  Activa el permiso de ubicación para este simulacro (círculo 200 m + bandera al norte de tu posición).
                </Text>
                <TouchableOpacity
                  style={[styles.openSettingsBtn, { borderColor: accent.main }]}
                  onPress={() => void Linking.openSettings()}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.openSettingsTxt, { color: accent.main }]}>Abrir ajustes del sistema</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ) : (
          <MapView
            style={StyleSheet.absoluteFill}
            region={region}
            onRegionChangeComplete={(nextRegion) => setRegion(nextRegion)}
            showsUserLocation={false}
            showsMyLocationButton={Platform.OS === 'android'}
            mapType="standard"
          >
            {effectiveDestination ? (
              <Circle
                center={effectiveDestination}
                radius={GEOFENCE_M}
                strokeColor={`${accent.main}88`}
                fillColor={`${accent.main}22`}
                strokeWidth={2}
              />
            ) : null}
            {userCoord ? (
              <Marker coordinate={userCoord} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={[styles.markerBase, { backgroundColor: accent.main }]}>
                  <Ionicons
                    name={role === 'transporte' ? 'bus-outline' : 'location'}
                    size={16}
                    color="#FFF"
                  />
                  <View style={styles.markerPulse} />
                </View>
              </Marker>
            ) : null}
            {effectiveDestination ? (
              <Marker coordinate={effectiveDestination} anchor={{ x: 0.5, y: 1 }}>
                <View style={[styles.destPin, { borderColor: accent.dark }]}>
                  <Ionicons name="flag" size={14} color={accent.dark} />
                </View>
              </Marker>
            ) : null}
          </MapView>
        )}

        {perm === 'granted' ? (
          <View style={styles.overlayCol} pointerEvents="box-none">
            <View style={[styles.gpsBadge, isOffline && styles.gpsBadgeOff]}>
              <Ionicons name={isOffline ? 'cloud-offline-outline' : 'flash-outline'} size={12} color="#FFF" />
              <Text style={styles.gpsBadgeTxt}>
                {isOffline ? 'MODO SATELITAL ACTIVADO' : 'CONEXIÓN GPS LIVE'}
              </Text>
            </View>
            {transportDemo ? (
              <View style={styles.simBadge}>
                <Text style={styles.simBadgeTxt}>SIMULACRO · Geocerca 200 m</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {transportDemo && userCoord && perm === 'granted' ? (
        <View style={styles.demoStrip}>
          <Text style={styles.demoStripTit}>Lectura GPS (primer plano)</Text>
          <Text style={styles.demoMono} selectable>
            {userCoord.latitude.toFixed(5)}, {userCoord.longitude.toFixed(5)}
          </Text>
          <Text style={styles.demoSmall}>
            Precisión ±{accuracyM != null ? Math.round(accuracyM) : '—'} m
            {lastFixAt ? ` · ${lastFixAt.toLocaleTimeString()}` : ''}
          </Text>
          <Text style={styles.demoHint}>
            Punto demo (bandera) ~245 m al norte: acércate para probar la geocerca. Seguimiento en segundo plano al generar el APK.
          </Text>
        </View>
      ) : null}

      <View style={styles.infoRow}>
        <View style={styles.infoTxt}>
          <Text style={styles.radarLabel}>ESTADO DE RUTA</Text>
          <Text style={styles.radarValue} numberOfLines={2}>
            {insideFence && effectiveDestination ? 'Cerca del destino · ' : ''}
            {routeStatusLabel}
          </Text>
          {pendingN > 0 ? (
            <Text style={styles.pendingHint}>{pendingN} llegada(s) pendientes de sync</Text>
          ) : null}
        </View>
        {showLlegueButton ? (
          <TouchableOpacity
            style={[styles.arrivalBtn, { backgroundColor: accent.main }]}
            onPress={() => void onLlegue()}
            activeOpacity={0.9}
          >
            <Text style={styles.arrivalBtnTxt}>LLEGUÉ</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFF',
    overflow: 'hidden',
    marginBottom: SPACE.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  mapBox: { backgroundColor: '#E2E8F0', position: 'relative' },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.md },
  mapLoadingTxt: { marginTop: SPACE.sm, fontSize: FONT.sizes.sm, color: '#64748B', textAlign: 'center' },
  overlayCol: { position: 'absolute', top: 14, left: 14 },
  simBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(15,23,42,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  simBadgeTxt: { color: '#FDE68A', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  demoTopBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACE.md + 2,
    paddingVertical: 12,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
  },
  demoTopTextCol: { flex: 1, marginLeft: 10 },
  demoTopTit: { fontSize: 13, fontWeight: '900', color: '#0F172A' },
  demoTopSub: { fontSize: 11, color: '#475569', marginTop: 4, lineHeight: 15, fontWeight: '600' },
  mapLoadingHint: {
    marginTop: 10,
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: SPACE.md,
    lineHeight: 15,
    fontWeight: '600',
  },
  openSettingsBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  openSettingsTxt: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  demoStrip: {
    paddingHorizontal: SPACE.md + 2,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  demoStripTit: { fontSize: 9, fontWeight: '900', color: '#64748B', letterSpacing: 1, marginBottom: 4 },
  demoMono: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  demoSmall: { fontSize: 10, color: '#64748B', marginTop: 4, fontWeight: '600' },
  demoHint: { fontSize: 9, color: '#94A3B8', marginTop: 6, lineHeight: 13, fontWeight: '500' },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  gpsBadgeOff: { backgroundColor: '#64748B' },
  gpsBadgeTxt: { color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  markerBase: {
    padding: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFF',
    ...Platform.select({ android: { elevation: 4 }, ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 } }),
  },
  markerPulse: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  destPin: {
    backgroundColor: '#FFF',
    padding: 6,
    borderRadius: 10,
    borderWidth: 2,
  },
  infoRow: {
    padding: SPACE.md + 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  infoTxt: { flex: 1 },
  radarLabel: { fontSize: 8, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8 },
  radarValue: { fontSize: 14, fontWeight: '900', color: '#0F172A', marginTop: 4 },
  pendingHint: { fontSize: 10, color: '#64748B', marginTop: 4, fontWeight: '600' },
  arrivalBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  arrivalBtnTxt: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
});
