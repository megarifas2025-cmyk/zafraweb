import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, Circle, Callout, type Region } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  rpcMarketEcosystemNearby,
  ecosystemJsonToPins,
  type MapPin,
} from '@/shared/services/marketBuyerService';
import type { BuyerStackParamList } from '@/features/buyer/navigation/BuyerStackParamList';
import { COLORS, SPACE, RADIUS } from '@/shared/utils/theme';
import { isNearVenezuelaDefaultCenter } from '@/shared/utils/venezuelaGeo';

const RADII_KM = [
  { label: '25 km', m: 25_000 },
  { label: '100 km', m: 100_000 },
  { label: '250 km', m: 250_000 },
];

function pinColor(kind: MapPin['kind']): string {
  if (kind === 'cosecha') return '#2E7D32';
  if (kind === 'company') return '#1565C0';
  return '#EF6C00';
}

export interface MarketMapViewProps {
  initialLat: number;
  initialLng: number;
}

export function MarketMapView({ initialLat, initialLng }: MarketMapViewProps) {
  const navigation = useNavigation<NativeStackNavigationProp<BuyerStackParamList>>();
  const centerRef = useRef({ lat: initialLat, lng: initialLng });
  const nationalSeed = isNearVenezuelaDefaultCenter(initialLat, initialLng);
  const [region, setRegion] = useState<Region>({
    latitude: initialLat,
    longitude: initialLng,
    latitudeDelta: nationalSeed ? 2.8 : 0.35,
    longitudeDelta: nationalSeed ? 2.8 : 0.35,
  });
  const [radiusM, setRadiusM] = useState(nationalSeed ? 100_000 : 25_000);
  const [pins, setPins] = useState<MapPin[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCosechaCalloutPress = useCallback(
    (pin: MapPin) => {
      if (pin.kind !== 'cosecha' || !pin.agricultorId) return;
      navigation.navigate('SharedProducerProfile', {
        producerId: pin.agricultorId,
        accessContext: 'buyer_view',
        producerName: pin.producerName,
      });
    },
    [navigation],
  );

  const fetchNearby = useCallback(async (lat: number, lng: number, meters: number) => {
    setLoading(true);
    try {
      const raw = await rpcMarketEcosystemNearby(lat, lng, meters);
      setErrorMsg(null);
      setPins(ecosystemJsonToPins(raw));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo cargar el mapa del ecosistema.';
      setPins([]);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRegionChangeComplete = useCallback(
    (r: Region) => {
      setRegion(r);
      centerRef.current = { lat: r.latitude, lng: r.longitude };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchNearby(r.latitude, r.longitude, radiusM);
      }, 500);
    },
    [fetchNearby, radiusM],
  );

  React.useEffect(() => {
    void fetchNearby(centerRef.current.lat, centerRef.current.lng, radiusM);
  }, [radiusM, fetchNearby]);

  React.useEffect(() => {
    centerRef.current = { lat: initialLat, lng: initialLng };
    const seededNational = isNearVenezuelaDefaultCenter(initialLat, initialLng);
    setRegion((prev) => ({
      ...prev,
      latitude: initialLat,
      longitude: initialLng,
      latitudeDelta: seededNational ? 2.8 : prev.latitudeDelta > 1 ? 0.35 : prev.latitudeDelta,
      longitudeDelta: seededNational ? 2.8 : prev.longitudeDelta > 1 ? 0.35 : prev.longitudeDelta,
    }));
    void fetchNearby(initialLat, initialLng, radiusM);
  }, [initialLat, initialLng, fetchNearby, radiusM]);

  const legend = useMemo(
    () => (
      <View style={s.legend}>
        <Text style={s.legendItem}>🟢 Cosechas</Text>
        <Text style={s.legendItem}>🔵 Silos</Text>
        <Text style={s.legendItem}>🟠 Agrotiendas</Text>
      </View>
    ),
    [],
  );

  return (
    <View style={s.wrap}>
      <View style={s.radiusRow}>
        {RADII_KM.map((r) => (
          <TouchableOpacity
            key={r.m}
            style={[s.radiusChip, radiusM === r.m && s.radiusChipOn]}
            onPress={() => setRadiusM(r.m)}
          >
            <Text style={[s.radiusTxt, radiusM === r.m && s.radiusTxtOn]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {legend}
      {errorMsg ? <Text style={s.error}>{errorMsg}</Text> : null}
      <View style={s.mapBox}>
        <MapView style={StyleSheet.absoluteFill} region={region} onRegionChangeComplete={onRegionChangeComplete}>
          <Circle
            center={{ latitude: region.latitude, longitude: region.longitude }}
            radius={radiusM}
            strokeColor="rgba(21,101,192,0.5)"
            fillColor="rgba(21,101,192,0.08)"
          />
          {pins.map((p) => (
            <Marker
              key={`${p.kind}-${p.id}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              pinColor={pinColor(p.kind)}
              tracksViewChanges={false}
              onCalloutPress={() => onCosechaCalloutPress(p)}
            >
              <Callout tooltip>
                <View style={s.calloutBox}>
                  <Text style={s.calloutTitle}>{p.title}</Text>
                  {p.subtitle ? (
                    <Text style={s.calloutSub} numberOfLines={3}>
                      {p.subtitle}
                    </Text>
                  ) : null}
                  {p.kind === 'cosecha' && p.agricultorId ? (
                    <Text style={s.calloutCta}>Ver perfil del productor →</Text>
                  ) : null}
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
        {loading && (
          <View style={s.loader}>
            <ActivityIndicator color={COLORS.roles.buyer} />
          </View>
        )}
      </View>
      <Text style={s.hint}>Mueve el mapa para revisar aliados y oferta agrícola dentro del radio seleccionado.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, minHeight: 360 },
  radiusRow: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACE.md, marginBottom: SPACE.xs },
  radiusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  radiusChipOn: { backgroundColor: COLORS.roles.buyer, borderColor: COLORS.roles.buyer },
  radiusTxt: { fontSize: 12, color: COLORS.text },
  radiusTxtOn: { color: '#FFF', fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: SPACE.md, marginBottom: SPACE.xs },
  legendItem: { fontSize: 11, color: COLORS.textSecondary },
  error: { fontSize: 11, color: COLORS.danger, paddingHorizontal: SPACE.md, marginBottom: SPACE.xs },
  mapBox: { flex: 1, marginHorizontal: SPACE.md, borderRadius: 12, overflow: 'hidden', minHeight: 280 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  hint: { fontSize: 10, color: COLORS.textDisabled, padding: SPACE.md, textAlign: 'center' },
  calloutBox: {
    minWidth: 160,
    maxWidth: 260,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  calloutTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  calloutSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  calloutCta: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.roles.buyer,
    marginTop: 8,
  },
});
