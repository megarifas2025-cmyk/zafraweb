/**
 * Flota propia — Unicornio B2B: vista de unidades, alta rápida y enlace a red aliada.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/shared/lib/supabase';
import { useCompany } from '../hooks/useCompany';
import { useAuth } from '@/shared/store/AuthContext';
import { SolicitarTransporteModal } from '@/shared/components/SolicitarTransporteModal';
import { freightTrackingStatusLabel, marcarFreightCompletado, obtenerFreightActivoPorUnidad } from '@/shared/services/freightRequestsService';
import { FONT, SPACE, SHADOW } from '@/shared/utils/theme';

const CREAM = '#FDFBF7';
const SLATE = '#0F172A';
const GOLD = '#FBBF24';
const CARD_RADIUS = 24;

type Unit = {
  id: string;
  placa: string;
  tipo_camion: string;
  activo: boolean;
  capacidad_ton: number | null;
  estado_logistico: string | null;
};

type ActiveFleetService = {
  id: string;
  fleet_unit_id: string | null;
  tipo_servicio: string;
  origen_municipio: string;
  origen_estado: string;
  destino_municipio: string | null;
  fecha_necesaria: string;
  tracking_status?: string | null;
  driver_name?: string | null;
};

export default function FleetManagement() {
  const insets = useSafeAreaInsets();
  const { perfil } = useAuth();
  const { company } = useCompany();
  const [units, setUnits] = useState<Unit[]>([]);
  const [placa, setPlaca] = useState('');
  const [tipo, setTipo] = useState('');
  const [capTon, setCapTon] = useState('');
  const [refresh, setRefresh] = useState(false);
  const [freightOpen, setFreightOpen] = useState(false);
  const [fleetPreset, setFleetPreset] = useState<string | null>(null);
  const [activeServices, setActiveServices] = useState<ActiveFleetService[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!company?.id) {
      setUnits([]);
      setActiveServices([]);
      setErrorMsg(null);
      return;
    }
    setErrorMsg(null);
    const [{ data, error }, servicesQuery] = await Promise.all([
      supabase
        .from('company_fleet_units')
        .select('id, placa, tipo_camion, activo, capacidad_ton, estado_logistico')
        .eq('company_id', company.id)
        .order('creado_en', { ascending: false }),
      perfil?.id
        ? supabase
            .from('freight_requests')
            .select('id, fleet_unit_id, tipo_servicio, origen_municipio, origen_estado, destino_municipio, fecha_necesaria, driver_name, tracking_status')
            .eq('requester_id', perfil.id)
            .eq('estado', 'asignada')
            .not('fleet_unit_id', 'is', null)
            .order('actualizado_en', { ascending: false })
        : Promise.resolve({ data: [] as ActiveFleetService[], error: null }),
    ]);
    if (error) {
      setActiveServices([]);
      const { data: basic, error: e2 } = await supabase
        .from('company_fleet_units')
        .select('id, placa, tipo_camion, activo')
        .eq('company_id', company.id)
        .order('creado_en', { ascending: false })
        .limit(200);
      if (!e2 && basic) {
        setUnits(
          (basic as { id: string; placa: string; tipo_camion: string; activo: boolean }[]).map((u) => ({
            ...u,
            capacidad_ton: null,
            estado_logistico: u.activo ? 'disponible' : null,
          })),
        );
        setErrorMsg('No pudimos cargar el detalle completo de la flota. Mostramos una versión resumida mientras se estabiliza la conexión.');
      } else {
        setErrorMsg('No se pudo cargar la flota en este momento. Desliza para reintentar.');
      }
      return;
    }
    setUnits((data as Unit[]) ?? []);
    if (!servicesQuery.error) {
      setActiveServices((servicesQuery.data as ActiveFleetService[]) ?? []);
    } else {
      setActiveServices([]);
      setErrorMsg('No pudimos cargar los servicios internos activos en este momento.');
    }
  }, [company?.id, perfil?.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!company) {
    return (
      <View style={[s.root, s.pendingRoot]}>
        <View style={s.pendingCard}>
          <Text style={s.title}>Flota propia</Text>
          <Text style={s.sub}>
            Primero completa y guarda los datos de empresa para activar la flota interna y poder asignar unidades a rutas.
          </Text>
        </View>
      </View>
    );
  }

  async function agregar() {
    if (!company?.id) return;
    const p = placa.trim().toUpperCase();
    const t = tipo.trim();
    if (!p || !t) {
      Alert.alert('Datos', 'Placa y tipo de camión son obligatorios.');
      return;
    }
    const cap = capTon.trim().replace(',', '.');
    const capNum = cap ? Number.parseFloat(cap) : null;
    const payload: Record<string, unknown> = {
      company_id: company.id,
      placa: p,
      tipo_camion: t,
      activo: true,
    };
    if (capNum != null && !Number.isNaN(capNum)) payload.capacidad_ton = capNum;

    const { error } = await supabase.from('company_fleet_units').insert(payload);
    if (error) {
      if (error.message.includes('capacidad_ton') || error.code === 'PGRST204') {
        const { error: e2 } = await supabase.from('company_fleet_units').insert({
          company_id: company.id,
          placa: p,
          tipo_camion: t,
          activo: true,
        });
        if (e2) {
          Alert.alert('Error', e2.message);
          return;
        }
        Alert.alert(
          'Unidad registrada',
          'La unidad se guardó, pero este entorno todavía no permite almacenar la capacidad en toneladas. Puedes seguir operando con la flota mientras se completa esa actualización.',
        );
      } else {
        Alert.alert('Error', error.message);
        return;
      }
    }
    setPlaca('');
    setTipo('');
    setCapTon('');
    await cargar();
  }

  async function cerrarViajeInterno(item: Unit) {
    if (!perfil?.id) return;
    try {
      const fr = await obtenerFreightActivoPorUnidad(item.id);
      if (!fr) {
        Alert.alert('Viaje', 'No se encontró un flete activo para esta unidad. Refresca la lista.');
        await cargar();
        return;
      }
      await marcarFreightCompletado(perfil.id, fr.id);
      Alert.alert('Listo', 'Viaje completado. La unidad vuelve a disponible.');
      await cargar();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cerrar el viaje.');
    }
  }

  const onRefresh = async () => {
    setRefresh(true);
    try {
      await cargar();
    } catch {
      /* ignore */
    } finally {
      setRefresh(false);
    }
  };

  function badgeFor(item: Unit) {
    if (!item.activo) return { label: 'Inactivo', style: s.badgeMuted };
    const st = item.estado_logistico ?? 'disponible';
    if (st === 'en_ruta') return { label: 'En ruta', style: s.badgeRoute };
    return { label: 'Disponible', style: s.badgeOk };
  }

  const header = (
    <>
      <Text style={s.title}>Flota propia</Text>
      <Text style={s.sub}>
        Aquí gestionas solo tu flota interna. El transporte externo se solicita desde el panel principal o desde materia prima.
      </Text>
      {errorMsg ? (
        <View style={s.errorBanner}>
          <Text style={s.errorTxt}>{errorMsg}</Text>
        </View>
      ) : null}

      <Text style={s.sec}>Alta de unidad</Text>
      <View style={s.formCard}>
        <Text style={s.label}>Placa</Text>
        <TextInput style={s.input} value={placa} onChangeText={setPlaca} placeholder="AA000AA" placeholderTextColor="#64748B" />
        <Text style={s.label}>Tipo de camión</Text>
        <TextInput
          style={s.input}
          value={tipo}
          onChangeText={setTipo}
          placeholder="Gandola, rabón, plataforma…"
          placeholderTextColor="#64748B"
        />
        <Text style={s.label}>Capacidad (t)</Text>
        <TextInput
          style={s.input}
          value={capTon}
          onChangeText={setCapTon}
          placeholder="Ej. 25"
          placeholderTextColor="#64748B"
          keyboardType="decimal-pad"
        />
        <TouchableOpacity style={s.btnAdd} onPress={() => void agregar()} activeOpacity={0.9}>
          <Text style={s.btnAddTxt}>Añadir a la flota</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.sec}>Unidades ({units.length})</Text>
      {activeServices.length > 0 ? (
        <>
          <Text style={s.sec}>Servicios internos activos ({activeServices.length})</Text>
          {activeServices.map((service) => {
            const unit = units.find((item) => item.id === service.fleet_unit_id);
            return (
              <View key={service.id} style={s.serviceCard}>
                <Text style={s.serviceTitle}>{service.tipo_servicio}</Text>
                <Text style={s.serviceMeta}>
                  Unidad: {unit?.placa ?? 'Sin placa'} · {service.origen_municipio}, {service.origen_estado}
                  {service.destino_municipio ? ` -> ${service.destino_municipio}` : ''}
                </Text>
                <Text style={s.serviceMeta}>
                  Fecha: {service.fecha_necesaria} · {service.driver_name ? `Chofer ${service.driver_name}` : 'Chofer pendiente'}
                </Text>
                <Text style={s.serviceMeta}>Estado operativo: {freightTrackingStatusLabel((service.tracking_status as never) ?? null)}</Text>
              </View>
            );
          })}
        </>
      ) : null}
    </>
  );

  return (
    <View style={s.root}>
      <FlatList
        data={units}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.listContent, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={GOLD} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Text style={s.empty}>
              {company?.id
                ? 'Sin unidades registradas. Añade placa y tipo arriba.'
                : 'Completa primero el perfil de empresa para activar la flota propia.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const b = badgeFor(item);
          const cap =
            item.capacidad_ton != null && !Number.isNaN(Number(item.capacidad_ton))
              ? `${Number(item.capacidad_ton)} t`
              : '— t';
          const enRuta = item.estado_logistico === 'en_ruta';
          const puedeAsignar = item.activo && !enRuta;
          return (
            <View style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.placa}>{item.placa}</Text>
                <View style={[s.badge, b.style]}>
                  <Text style={s.badgeTxt}>{b.label}</Text>
                </View>
              </View>
              <Text style={s.tipo}>{item.tipo_camion}</Text>
              <Text style={s.meta}>Capacidad · {cap}</Text>
              <TouchableOpacity
                style={[s.btnGhost, !puedeAsignar && s.btnGhostDisabled]}
                onPress={() => {
                  if (!puedeAsignar) return;
                  setFleetPreset(item.id);
                  setFreightOpen(true);
                }}
                activeOpacity={puedeAsignar ? 0.85 : 1}
                disabled={!puedeAsignar}
              >
                <Text style={[s.btnGhostTxt, !puedeAsignar && s.btnGhostTxtDisabled]}>Asignar unidad a ruta</Text>
              </TouchableOpacity>
              {enRuta ? (
                <TouchableOpacity style={s.btnCerrar} onPress={() => void cerrarViajeInterno(item)} activeOpacity={0.88}>
                  <Text style={s.btnCerrarTxt}>Cerrar viaje</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
      />

      <SolicitarTransporteModal
        visible={freightOpen}
        onClose={() => {
          setFreightOpen(false);
          setFleetPreset(null);
        }}
        perfil={perfil ?? null}
        initialFleetUnitId={fleetPreset}
        initialMode="flota"
        lockMode
        title="Asignar viaje con flota propia"
        onCreated={() => void cargar()}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  pendingRoot: { justifyContent: 'center', padding: SPACE.md },
  pendingCard: {
    backgroundColor: '#fff',
    borderRadius: CARD_RADIUS,
    padding: SPACE.lg,
    ...SHADOW.sm,
  },
  title: { fontSize: FONT.sizes.xxl, fontWeight: FONT.weights.heavy, color: SLATE },
  sub: { fontSize: FONT.sizes.sm, color: '#475569', marginTop: 6, marginBottom: SPACE.md, lineHeight: 20 },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorTxt: { color: '#B91C1C', fontSize: FONT.sizes.sm, lineHeight: 20 },
  sec: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: SLATE, marginBottom: SPACE.sm },
  formCard: {
    backgroundColor: SLATE,
    borderRadius: CARD_RADIUS,
    padding: SPACE.lg,
    marginBottom: SPACE.lg,
    ...SHADOW.md,
  },
  label: { fontSize: FONT.sizes.xs, color: '#94A3B8', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    color: '#FFF',
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  btnAdd: {
    backgroundColor: GOLD,
    paddingVertical: SPACE.md,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnAddTxt: { color: SLATE, fontWeight: FONT.weights.heavy, fontSize: FONT.sizes.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  listContent: { paddingHorizontal: SPACE.md, paddingTop: SPACE.md, paddingBottom: SPACE.xxl },
  emptyCard: {
    backgroundColor: SLATE,
    borderRadius: CARD_RADIUS,
    padding: SPACE.xl,
    ...SHADOW.sm,
  },
  empty: { color: '#94A3B8', textAlign: 'center', fontSize: FONT.sizes.sm },
  card: {
    backgroundColor: SLATE,
    borderRadius: CARD_RADIUS,
    padding: SPACE.lg,
    marginBottom: SPACE.md,
    ...SHADOW.md,
  },
  serviceCard: {
    backgroundColor: '#fff8e1',
    borderRadius: 18,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  serviceTitle: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.heavy, color: SLATE },
  serviceMeta: { fontSize: FONT.sizes.sm, color: '#475569', marginTop: 4, lineHeight: 18 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placa: { fontWeight: FONT.weights.heavy, fontSize: FONT.sizes.lg, color: '#FFF', letterSpacing: 1 },
  tipo: { fontSize: FONT.sizes.sm, color: '#CBD5E1', marginTop: 6 },
  meta: { fontSize: FONT.sizes.sm, color: GOLD, marginTop: 10, fontWeight: FONT.weights.semibold },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  badgeOk: { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
  badgeRoute: { backgroundColor: 'rgba(251, 191, 36, 0.2)' },
  badgeMuted: { backgroundColor: 'rgba(148, 163, 184, 0.25)' },
  badgeTxt: { fontSize: 11, fontWeight: FONT.weights.bold, color: '#FFF', textTransform: 'uppercase', letterSpacing: 0.6 },
  btnGhost: {
    marginTop: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
    borderRadius: 12,
    paddingVertical: SPACE.sm,
    alignItems: 'center',
  },
  btnGhostDisabled: { opacity: 0.42, borderColor: 'rgba(148, 163, 184, 0.35)' },
  btnGhostTxt: { color: GOLD, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold },
  btnGhostTxtDisabled: { color: '#94A3B8' },
  btnCerrar: {
    marginTop: SPACE.sm,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderRadius: 12,
    paddingVertical: SPACE.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.5)',
  },
  btnCerrarTxt: { color: GOLD, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold },
});
