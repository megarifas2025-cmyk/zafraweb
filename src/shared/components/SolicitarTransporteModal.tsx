import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Perfil, LogisticsSala } from '@/shared/types';
import { supabase } from '@/shared/lib/supabase';
import {
  puedeCrearSolicitudTransporte,
  crearFreightRequest,
  crearFreightRequestFlotaInterna,
  marcarFreightCompletado,
  listarMisSolicitudesFreight,
  listarSalasPorFreightRequest,
} from '@/shared/services/freightRequestsService';
import { calificarTransportistaDesdeFreight } from '@/shared/services/ratingsService';
import { LogisticsChatModal } from './LogisticsChatModal';
import { MapaEnVivoModal } from './MapaEnVivoModal';
import { ESTADOS_REGISTRO, municipiosPorEstado } from '@/shared/data/venezuelaMunicipios';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import { ScrollableListModal } from './ScrollableListModal';

const TIPOS_SERVICIO = [
  'Movilización de Cosecha',
  'Traslado de Insumos',
  'Movimiento de Maquinaria',
  'Otro',
] as const;

type ReqRow = {
  id: string;
  tipo_servicio: string;
  origen_municipio: string;
  origen_estado: string;
  estado: string;
  fecha_necesaria: string;
  fleet_unit_id?: string | null;
  assigned_transportista_id?: string | null;
};

interface Props {
  visible: boolean;
  onClose: () => void;
  perfil: Perfil | null;
  onCreated?: () => void;
  /** Relleno al abrir desde la calculadora de cosecha (peso kg + nota). */
  initialPrefill?: { peso?: string; descripcion?: string } | null;
  /** Preselecciona unidad de flota (empresa) y modo flota propia. */
  initialFleetUnitId?: string | null;
  initialMode?: 'pizarra' | 'flota';
  lockMode?: boolean;
  title?: string;
}

export function SolicitarTransporteModal({
  visible,
  onClose,
  perfil,
  onCreated,
  initialPrefill,
  initialFleetUnitId,
  initialMode,
  lockMode = false,
  title,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'crear' | 'mis'>('crear');
  const [tipoIdx, setTipoIdx] = useState(0);
  const [origenEstado, setOrigenEstado] = useState<string>(ESTADOS_REGISTRO[0]!);
  const [origenMuni, setOrigenMuni] = useState('');
  const [destEstado, setDestEstado] = useState('');
  const [destMuni, setDestMuni] = useState('');
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [desc, setDesc] = useState('');
  const [peso, setPeso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mis, setMis] = useState<ReqRow[]>([]);
  const [cargandoMis, setCargandoMis] = useState(false);
  const [salasMap, setSalasMap] = useState<Record<string, LogisticsSala[]>>({});
  const [logChatOpen, setLogChatOpen] = useState(false);
  const [logChatSalaId, setLogChatSalaId] = useState<string | null>(null);
  const [logChatSubtitle, setLogChatSubtitle] = useState<string | null>(null);
  const [mapaFreightId, setMapaFreightId] = useState<string | null>(null);
  const [mapaOpen, setMapaOpen] = useState(false);
  const [modalOrigenEstado, setModalOrigenEstado] = useState(false);
  const [modalOrigenMuni, setModalOrigenMuni] = useState(false);
  const [modalDestEstado, setModalDestEstado] = useState(false);
  const [modalDestMuni, setModalDestMuni] = useState(false);
  const [modoTransporte, setModoTransporte] = useState<'pizarra' | 'flota'>('pizarra');
  const [fleetUnits, setFleetUnits] = useState<
    { id: string; placa: string; tipo_camion: string; activo: boolean; estado_logistico?: string | null }[]
  >([]);
  const [fleetSel, setFleetSel] = useState<string | null>(null);

  const munisOrigen = useMemo(() => municipiosPorEstado(origenEstado), [origenEstado]);
  const munisDestino = useMemo(() => (destEstado ? municipiosPorEstado(destEstado) : []), [destEstado]);

  useEffect(() => {
    if (!munisOrigen.length) return;
    setOrigenMuni(m => (m && munisOrigen.includes(m) ? m : munisOrigen[0]!));
  }, [origenEstado, munisOrigen]);

  useEffect(() => {
    if (!visible || !perfil?.id || tab !== 'mis') return;
    let ok = true;
    (async () => {
      setCargandoMis(true);
      try {
        const rows = await listarMisSolicitudesFreight(perfil.id);
        if (!ok) return;
        setMis(rows as unknown as ReqRow[]);
        // Cargar salas para cada solicitud no-flota
        const pizarraIds = (rows as unknown as ReqRow[])
          .filter((r) => !r.fleet_unit_id)
          .map((r) => r.id);
        if (pizarraIds.length > 0) {
          const results = await Promise.all(
            pizarraIds.map((id) =>
              listarSalasPorFreightRequest(id).catch(() => [] as LogisticsSala[]),
            ),
          );
          if (ok) {
            const map: Record<string, LogisticsSala[]> = {};
            pizarraIds.forEach((id, i) => { map[id] = results[i] ?? []; });
            setSalasMap(map);
          }
        }
      } catch {
        if (ok) setMis([]);
      } finally {
        if (ok) setCargandoMis(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, [visible, perfil?.id, tab]);

  useEffect(() => {
    if (visible && perfil?.estado_ve) {
      const st = ESTADOS_REGISTRO.includes(perfil.estado_ve as (typeof ESTADOS_REGISTRO)[number])
        ? perfil.estado_ve
        : ESTADOS_REGISTRO[0];
      setOrigenEstado(st);
      if (perfil.municipio) setOrigenMuni(perfil.municipio);
    }
  }, [visible, perfil?.estado_ve, perfil?.municipio]);

  useEffect(() => {
    if (!visible || !initialPrefill) return;
    if (initialPrefill.peso != null && initialPrefill.peso !== '') setPeso(initialPrefill.peso);
    if (initialPrefill.descripcion != null && initialPrefill.descripcion !== '') setDesc(initialPrefill.descripcion);
  }, [visible, initialPrefill]);

  useEffect(() => {
    if (!visible) {
      setModoTransporte('pizarra');
      setFleetSel(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !initialMode || perfil?.rol !== 'company') return;
    setModoTransporte(initialMode);
  }, [visible, initialMode, perfil?.rol]);

  useEffect(() => {
    if (!visible || !initialFleetUnitId || perfil?.rol !== 'company') return;
    setModoTransporte('flota');
    setFleetSel(initialFleetUnitId);
  }, [visible, initialFleetUnitId, perfil?.rol]);

  useEffect(() => {
    if (!visible || perfil?.rol !== 'company' || !perfil.id) {
      setFleetUnits([]);
      return;
    }
    let alive = true;
    (async () => {
      const { data: co, error: coErr } = await supabase.from('companies').select('id').eq('perfil_id', perfil.id).maybeSingle();
      if (!alive) return;
      if (coErr || !co?.id) return;
      const q = await supabase
        .from('company_fleet_units')
        .select('id, placa, tipo_camion, activo, estado_logistico')
        .eq('company_id', co.id)
        .eq('activo', true)
        .order('creado_en', { ascending: false });
      if (q.error) {
        const { data: u2 } = await supabase
          .from('company_fleet_units')
          .select('id, placa, tipo_camion, activo')
          .eq('company_id', co.id)
          .eq('activo', true)
          .order('creado_en', { ascending: false });
        if (alive)
          setFleetUnits(
            (u2 ?? []).map((r) => ({ ...r, estado_logistico: (r as { estado_logistico?: string }).estado_logistico ?? 'disponible' })),
          );
        return;
      }
      if (alive)
        setFleetUnits(
          (q.data ?? []) as {
            id: string;
            placa: string;
            tipo_camion: string;
            activo: boolean;
            estado_logistico?: string | null;
          }[],
        );
    })();
    return () => {
      alive = false;
    };
  }, [visible, perfil?.id, perfil?.rol]);

  const recargarMis = useCallback(async () => {
    if (!perfil?.id) return;
    const rows = await listarMisSolicitudesFreight(perfil.id);
    setMis(rows as unknown as ReqRow[]);
  }, [perfil?.id]);

  async function registrarMovimientoInterno() {
    if (!perfil || !puedeCrearSolicitudTransporte(perfil.rol)) {
      Alert.alert('Rol', 'Tu perfil no puede registrar este movimiento.');
      return;
    }
    if (!fleetSel) {
      Alert.alert('Unidad', 'Selecciona una placa de tu flota propia.');
      return;
    }
    const unidad = fleetUnits.find((x) => x.id === fleetSel);
    if (unidad?.estado_logistico === 'en_ruta') {
      Alert.alert('Unidad ocupada', 'Esa unidad ya está en ruta. Cierra el viaje actual antes de asignar otro.');
      return;
    }
    if (!origenMuni.trim() || !fecha.trim()) {
      Alert.alert('Datos', 'Indica municipio de origen y fecha necesaria.');
      return;
    }
    setGuardando(true);
    try {
      await crearFreightRequestFlotaInterna({
        requester_id: perfil.id,
        requester_role: perfil.rol,
        tipo_servicio:
          TIPOS_SERVICIO[tipoIdx] === 'Otro' ? 'Otro (especificar en descripción)' : `${TIPOS_SERVICIO[tipoIdx]} (flota propia)`,
        origen_estado: origenEstado,
        origen_municipio: origenMuni.trim(),
        destino_estado: destEstado.trim() || null,
        destino_municipio: destMuni.trim() || null,
        fecha_necesaria: fecha,
        descripcion: desc.trim() || null,
        peso_estimado_kg: peso.trim() ? Number.parseFloat(peso.replace(',', '.')) : null,
        fleet_unit_id: fleetSel,
      });
      Alert.alert(
        'Viaje interno',
        `Registrado para ${unidad?.placa ?? 'la unidad'}. La unidad queda en ruta hasta que marques el viaje como completado.`,
      );
      trackUiEvent({
        eventType: 'submit',
        eventName: 'freight_internal_assignment_created',
        screen: 'SolicitarTransporteModal',
        module: 'transporte',
        targetType: 'fleet_unit',
        targetId: fleetSel,
        status: 'success',
        metadata: {
          origen_estado: origenEstado,
          origen_municipio: origenMuni.trim(),
          destino_estado: destEstado.trim() || null,
          destino_municipio: destMuni.trim() || null,
        },
      });
      onCreated?.();
      setTab('mis');
      await recargarMis();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'No se pudo registrar. ¿Ejecutaste database/delta-freight-fleet-unit-link.sql?';
      Alert.alert('Error', msg);
    } finally {
      setGuardando(false);
    }
  }

  async function completarViajeInterno(freightId: string) {
    if (!perfil?.id) return;
    try {
      await marcarFreightCompletado(perfil.id, freightId);
      trackUiEvent({
        eventType: 'submit',
        eventName: 'freight_internal_completed',
        screen: 'SolicitarTransporteModal',
        module: 'transporte',
        targetType: 'freight_request',
        targetId: freightId,
        status: 'success',
      });
      Alert.alert('Listo', 'Viaje marcado como completado. La unidad vuelve a disponible.');
      await recargarMis();
      onCreated?.();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo completar.');
    }
  }

  async function enviar() {
    if (!perfil || !puedeCrearSolicitudTransporte(perfil.rol)) {
      Alert.alert('Rol', 'Tu perfil no puede crear solicitudes de transporte desde aquí.');
      return;
    }
    if (!origenMuni.trim() || !fecha.trim()) {
      Alert.alert('Datos', 'Indica municipio de origen y fecha.');
      return;
    }
    setGuardando(true);
    try {
      await crearFreightRequest({
        requester_id: perfil.id,
        requester_role: perfil.rol,
        tipo_servicio: TIPOS_SERVICIO[tipoIdx] === 'Otro' ? 'Otro (especificar en descripción)' : TIPOS_SERVICIO[tipoIdx],
        origen_estado: origenEstado,
        origen_municipio: origenMuni.trim(),
        destino_estado: destEstado.trim() || null,
        destino_municipio: destMuni.trim() || null,
        fecha_necesaria: fecha,
        descripcion: desc.trim() || null,
        peso_estimado_kg: peso.trim() ? Number.parseFloat(peso.replace(',', '.')) : null,
      });
      trackUiEvent({
        eventType: 'submit',
        eventName: 'freight_request_created',
        screen: 'SolicitarTransporteModal',
        module: 'transporte',
        targetType: 'freight_request',
        targetId: perfil.id,
        status: 'success',
        metadata: {
          requester_role: perfil.rol,
          origen_estado: origenEstado,
          origen_municipio: origenMuni.trim(),
          destino_estado: destEstado.trim() || null,
          destino_municipio: destMuni.trim() || null,
        },
      });
      Alert.alert('Enviado', 'Tu solicitud está en la pizarra pública de transportistas.');
      onCreated?.();
      setTab('mis');
      await recargarMis();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar. ¿Ejecutaste el SQL de freight_requests en Supabase?';
      Alert.alert('Error', msg);
    } finally {
      setGuardando(false);
    }
  }

  function abrirSalaChat(salaId: string, subtitle: string) {
    setLogChatSalaId(salaId);
    setLogChatSubtitle(subtitle);
    setLogChatOpen(true);
    trackUiEvent({
      eventType: 'open_modal',
      eventName: 'freight_chat_opened',
      screen: 'SolicitarTransporteModal',
      module: 'transporte',
      targetType: 'logistics_sala',
      targetId: salaId,
      status: 'success',
      metadata: { subtitle },
    });
  }

  function calificarTransportista(freightId: string) {
    const abrirSelectorPuntaje = (comentario?: string) => {
      Alert.alert(
        'Puntaje',
        Platform.OS === 'ios'
          ? 'Selecciona del 1 al 5'
          : 'Selecciona del 1 al 5. En Android enviaremos la calificacion sin comentario.',
        [1, 2, 3, 4, 5].map((p) => ({
          text: '⭐'.repeat(p),
          onPress: () => {
            void calificarTransportistaDesdeFreight({ freightId, puntaje: p, comentario: comentario || null })
              .then(() => Alert.alert('Gracias', 'Tu calificación fue enviada.'))
              .catch((e: unknown) => Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo enviar.'));
          },
        })),
      );
    };

    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Calificar transportista',
        'Ingresa tu comentario (opcional). Luego elige el puntaje.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Continuar',
            onPress: (texto: string | undefined) => abrirSelectorPuntaje(texto ?? ''),
          },
        ],
        'plain-text',
      );
      return;
    }

    Alert.alert(
      'Calificar transportista',
      'Selecciona el puntaje para este viaje.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: () => abrirSelectorPuntaje() },
      ],
    );
  }

  async function recargarSalasDe(reqId: string) {
    try {
      const salas = await listarSalasPorFreightRequest(reqId);
      setSalasMap(prev => ({ ...prev, [reqId]: salas }));
      await recargarMis();
    } catch { /* silent */ }
  }

  if (!perfil || !puedeCrearSolicitudTransporte(perfil.rol)) return null;

  return (
    <>
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <View style={s.sheet}>
          <View style={[s.head, { paddingTop: Math.max(insets.top, SPACE.md) }]}>
            <Text style={s.title}>{title ?? 'Solicitar transporte'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.cerrar}>Cerrar</Text></TouchableOpacity>
          </View>
          <View style={s.tabs}>
            <TouchableOpacity style={[s.tab, tab === 'crear' && s.tabOn]} onPress={() => setTab('crear')}>
              <Text style={[s.tabTxt, tab === 'crear' && s.tabTxtOn]}>Nueva</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, tab === 'mis' && s.tabOn]} onPress={() => setTab('mis')}>
              <Text style={[s.tabTxt, tab === 'mis' && s.tabTxtOn]}>Mis solicitudes</Text>
            </TouchableOpacity>
          </View>

          {tab === 'crear' ? (
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
              {perfil?.rol === 'company' && !lockMode ? (
                <>
                  <Text style={s.label}>¿Cómo movilizas la carga?</Text>
                  <View style={s.modoRow}>
                    <TouchableOpacity
                      style={[s.modoChip, modoTransporte === 'flota' && s.modoChipOn]}
                      onPress={() => setModoTransporte('flota')}
                      activeOpacity={0.88}
                    >
                      <Text style={[s.modoChipTxt, modoTransporte === 'flota' && s.modoChipTxtOn]}>Flota propia</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.modoChip, modoTransporte === 'pizarra' && s.modoChipOn]}
                      onPress={() => setModoTransporte('pizarra')}
                      activeOpacity={0.88}
                    >
                      <Text style={[s.modoChipTxt, modoTransporte === 'pizarra' && s.modoChipTxtOn]}>Pizarra pública</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}

              {perfil?.rol === 'company' && modoTransporte === 'flota' ? (
                <>
                  {lockMode ? <Text style={s.modeBadge}>Asignación con flota propia</Text> : null}
                  <Text style={s.label}>Tipo de servicio</Text>
                  <View style={s.chips}>
                    {TIPOS_SERVICIO.map((t, i) => (
                      <TouchableOpacity key={t} style={[s.chip, tipoIdx === i && s.chipOn]} onPress={() => setTipoIdx(i)}>
                        <Text style={[s.chipTxt, tipoIdx === i && s.chipTxtOn]} numberOfLines={2}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.label}>Origen</Text>
                  <TouchableOpacity style={s.picker} onPress={() => setModalOrigenEstado(true)} activeOpacity={0.85}>
                    <Text style={s.pickerTxt}>{origenEstado}</Text>
                  </TouchableOpacity>
                  <Text style={s.label}>Municipio origen</Text>
                  <TouchableOpacity style={s.picker} onPress={() => setModalOrigenMuni(true)} activeOpacity={0.85}>
                    <Text style={s.pickerTxt}>{origenMuni || 'Selecciona municipio'}</Text>
                  </TouchableOpacity>
                  <Text style={s.label}>Destino (opcional)</Text>
                  <TouchableOpacity style={s.picker} onPress={() => setModalDestEstado(true)} activeOpacity={0.85}>
                    <Text style={destEstado ? s.pickerTxt : s.pickerPlaceholder}>{destEstado || 'Estado destino'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.picker} onPress={() => { if (!destEstado) { Alert.alert('Destino', 'Selecciona primero el estado destino.'); return; } setModalDestMuni(true); }} activeOpacity={0.85}>
                    <Text style={destMuni ? s.pickerTxt : s.pickerPlaceholder}>{destMuni || 'Municipio destino'}</Text>
                  </TouchableOpacity>
                  <Text style={s.label}>Fecha necesaria (AAAA-MM-DD)</Text>
                  <TextInput style={s.input} value={fecha} onChangeText={setFecha} placeholder="2026-03-25" placeholderTextColor={COLORS.textDisabled} />
                  <Text style={s.label}>Peso estimado kg (opcional)</Text>
                  <TextInput style={s.input} value={peso} onChangeText={setPeso} keyboardType="decimal-pad" placeholder="5000" placeholderTextColor={COLORS.textDisabled} />
                  <Text style={s.label}>Unidad de flota</Text>
                  {fleetUnits.length === 0 ? (
                    <Text style={s.hintFlota}>No hay unidades activas. Registra placas en Flota propia.</Text>
                  ) : (
                    fleetUnits.map((u) => {
                      const ocupada = u.estado_logistico === 'en_ruta';
                      return (
                        <TouchableOpacity
                          key={u.id}
                          style={[s.fleetRow, fleetSel === u.id && s.fleetRowOn, ocupada && s.fleetRowDisabled]}
                          onPress={() => {
                            if (ocupada) return;
                            setFleetSel(u.id);
                          }}
                          activeOpacity={ocupada ? 1 : 0.88}
                          disabled={ocupada}
                        >
                          <Text style={[s.fleetPlaca, ocupada && s.fleetPlacaDisabled]}>{u.placa}</Text>
                          <Text style={s.fleetTipo}>{ocupada ? 'En ruta — no disponible' : u.tipo_camion}</Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                  <Text style={s.label}>Nota interna (opcional)</Text>
                  <TextInput
                    style={[s.input, s.multiline]}
                    value={desc}
                    onChangeText={setDesc}
                    placeholder="Ventana horaria, contacto en finca…"
                    multiline
                    placeholderTextColor={COLORS.textDisabled}
                  />
                  <TouchableOpacity style={s.btn} onPress={() => void registrarMovimientoInterno()} disabled={guardando}>
                    {guardando ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={s.btnTxt}>Registrar asignación interna</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
              {lockMode && perfil?.rol === 'company' ? <Text style={s.modeBadge}>Solicitud de transporte externo</Text> : null}
              <Text style={s.label}>Tipo de servicio</Text>
              <View style={s.chips}>
                {TIPOS_SERVICIO.map((t, i) => (
                  <TouchableOpacity key={t} style={[s.chip, tipoIdx === i && s.chipOn]} onPress={() => setTipoIdx(i)}>
                    <Text style={[s.chipTxt, tipoIdx === i && s.chipTxtOn]} numberOfLines={2}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>Origen</Text>
              <TouchableOpacity style={s.picker} onPress={() => setModalOrigenEstado(true)} activeOpacity={0.85}>
                <Text style={s.pickerTxt}>{origenEstado}</Text>
              </TouchableOpacity>
              <Text style={s.label}>Municipio origen</Text>
              <TouchableOpacity style={s.picker} onPress={() => setModalOrigenMuni(true)} activeOpacity={0.85}>
                <Text style={s.pickerTxt}>{origenMuni || 'Selecciona municipio'}</Text>
              </TouchableOpacity>
              <Text style={s.label}>Destino (opcional)</Text>
              <TouchableOpacity style={s.picker} onPress={() => setModalDestEstado(true)} activeOpacity={0.85}>
                <Text style={destEstado ? s.pickerTxt : s.pickerPlaceholder}>{destEstado || 'Estado destino'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.picker} onPress={() => { if (!destEstado) { Alert.alert('Destino', 'Selecciona primero el estado destino.'); return; } setModalDestMuni(true); }} activeOpacity={0.85}>
                <Text style={destMuni ? s.pickerTxt : s.pickerPlaceholder}>{destMuni || 'Municipio destino'}</Text>
              </TouchableOpacity>
              <Text style={s.label}>Fecha necesaria (AAAA-MM-DD)</Text>
              <TextInput style={s.input} value={fecha} onChangeText={setFecha} placeholder="2026-03-25" placeholderTextColor={COLORS.textDisabled} />
              <Text style={s.label}>Peso estimado kg (opcional)</Text>
              <TextInput style={s.input} value={peso} onChangeText={setPeso} keyboardType="decimal-pad" placeholder="5000" placeholderTextColor={COLORS.textDisabled} />
              <Text style={s.label}>Descripción</Text>
              <TextInput style={[s.input, s.multiline]} value={desc} onChangeText={setDesc} placeholder="Detalle de carga, ventanas horarias…" multiline placeholderTextColor={COLORS.textDisabled} />
              <TouchableOpacity style={s.btn} onPress={() => void enviar()} disabled={guardando}>
                {guardando ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={s.btnTxt}>{perfil?.rol === 'company' ? 'Publicar en pizarra pública' : 'Publicar en pizarra'}</Text>
                )}
              </TouchableOpacity>
                </>
              )}
            </ScrollView>
          ) : (
            <View style={s.misWrap}>
              {cargandoMis ? <ActivityIndicator style={{ marginTop: 24 }} /> : (
                <FlatList
                  data={mis}
                  keyExtractor={r => r.id}
                  contentContainerStyle={s.misList}
                  ListEmptyComponent={<Text style={s.empty}>No tienes solicitudes aún.</Text>}
                  renderItem={({ item }) => {
                    const esFlotaInterna = Boolean(item.fleet_unit_id) && !item.assigned_transportista_id;
                    const salas = salasMap[item.id] ?? [];
                    const subtitle = `${item.tipo_servicio} · ${item.origen_municipio}, ${item.origen_estado}`;
                    return (
                      <View style={s.card}>
                        <Text style={s.cardTit}>{item.tipo_servicio}</Text>
                        {esFlotaInterna ? <Text style={s.badgeInterno}>Flota propia</Text> : null}
                        <Text style={s.cardSub}>
                          {item.origen_municipio}, {item.origen_estado} · {item.fecha_necesaria} · {item.estado}
                        </Text>

                        {/* Salas de negociación previa (chat-primero) */}
                        {!esFlotaInterna && item.estado !== 'asignada' ? (
                          salas.length === 0 ? (
                            <Text style={s.cardSub}>Aún nadie te ha contactado.</Text>
                          ) : (
                            <>
                              <Text style={s.salasTit}>💬 Transportistas que te contactaron:</Text>
                              {salas.map((sala) => (
                                <View key={sala.id} style={s.salaRow}>
                                  <View style={s.salaInfo}>
                                    <Text style={s.salaName}>
                                      🚛 {(sala.perfiles as { nombre?: string } | null)?.nombre ?? sala.transportista_id.slice(0, 8)}
                                    </Text>
                                    {sala.trato_cerrado ? (
                                      <Text style={s.salaCerrada}>✅ Trato confirmado</Text>
                                    ) : null}
                                  </View>
                                  <TouchableOpacity
                                    style={s.abrirChat}
                                    onPress={() => abrirSalaChat(sala.id, subtitle)}
                                  >
                                    <Text style={s.abrirChatTxt}>
                                      {sala.trato_cerrado ? 'Ver chat' : 'Abrir chat'}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </>
                          )
                        ) : null}

                        {/* Ya fue asignada: mostrar chat de coordinación con el elegido */}
                        {!esFlotaInterna && item.estado === 'asignada' ? (
                          <>
                            {salas.filter(s2 => s2.trato_cerrado).map((sala) => (
                              <TouchableOpacity
                                key={sala.id}
                                style={s.linkChat}
                                onPress={() => abrirSalaChat(sala.id, subtitle)}
                              >
                                <Text style={s.linkChatTxt}>💬 Coordinación con transportista confirmado</Text>
                              </TouchableOpacity>
                            ))}
                            {/* Botón Ver en mapa */}
                            <TouchableOpacity
                              style={s.mapBtn}
                              onPress={() => { setMapaFreightId(item.id); setMapaOpen(true); }}
                            >
                              <Ionicons name="map-outline" size={14} color="#1d4ed8" />
                              <Text style={s.mapBtnTxt}>Ver en mapa</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}

                        {esFlotaInterna && item.estado === 'asignada' ? (
                          <TouchableOpacity style={s.cerrarInterno} onPress={() => void completarViajeInterno(item.id)}>
                            <Text style={s.cerrarInternoTxt}>Marcar viaje como completado</Text>
                          </TouchableOpacity>
                        ) : null}

                        {/* Calificar transportista cuando el viaje está completado */}
                        {!esFlotaInterna && item.estado === 'completado' ? (
                          <TouchableOpacity
                            style={s.ratingBtn}
                            onPress={() => calificarTransportista(item.id)}
                          >
                            <Ionicons name="star-outline" size={14} color="#f59e0b" />
                            <Text style={s.ratingBtnTxt}>Calificar transportista</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  }}
                />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <LogisticsChatModal
      visible={logChatOpen}
      onClose={() => {
        setLogChatOpen(false);
        setLogChatSalaId(null);
        setLogChatSubtitle(null);
      }}
      salaId={logChatSalaId}
      perfil={perfil}
      subtitle={logChatSubtitle}
      onTratoCerrado={() => {
        if (logChatSalaId) {
          // Encontrar el freightRequestId de esta sala para recargar sus salas
          for (const [reqId, salas] of Object.entries(salasMap)) {
            if (salas.some(s2 => s2.id === logChatSalaId)) {
              void recargarSalasDe(reqId);
              break;
            }
          }
        }
      }}
    />

    <MapaEnVivoModal
      visible={mapaOpen}
      onClose={() => { setMapaOpen(false); setMapaFreightId(null); }}
      freightRequestId={mapaFreightId}
    />

    <ScrollableListModal
      visible={modalOrigenEstado}
      title="Estado (origen)"
      data={ESTADOS_REGISTRO}
      keyExtractor={item => item}
      label={item => item}
      onSelect={setOrigenEstado}
      onClose={() => setModalOrigenEstado(false)}
    />

    <ScrollableListModal
      visible={modalOrigenMuni}
      title={origenEstado}
      data={munisOrigen}
      keyExtractor={item => item}
      label={item => item}
      onSelect={setOrigenMuni}
      onClose={() => setModalOrigenMuni(false)}
    />

    <ScrollableListModal
      visible={modalDestEstado}
      title="Estado (destino)"
      data={ESTADOS_REGISTRO}
      keyExtractor={item => item}
      label={item => item}
      onSelect={(val) => { setDestEstado(val); setDestMuni(''); }}
      onClose={() => setModalDestEstado(false)}
    />

    <ScrollableListModal
      visible={modalDestMuni}
      title={destEstado}
      data={munisDestino}
      keyExtractor={item => item}
      label={item => item}
      onSelect={setDestMuni}
      onClose={() => setModalDestMuni(false)}
    />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.background, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, maxHeight: '86%', ...SHADOW.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.md, borderBottomWidth: 1, borderColor: COLORS.border },
  title: { fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold, color: COLORS.text },
  cerrar: { color: COLORS.primary, fontWeight: FONT.weights.semibold },
  tabs: { flexDirection: 'row', marginHorizontal: SPACE.md, marginTop: SPACE.sm, gap: SPACE.sm },
  tab: { flex: 1, padding: SPACE.sm, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  tabOn: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  tabTxt: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary },
  tabTxtOn: { fontWeight: FONT.weights.bold, color: COLORS.primary },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  modeBadge: {
    alignSelf: 'flex-start',
    marginTop: SPACE.sm,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: '#ecfdf5',
    color: COLORS.primary,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  label: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: SPACE.sm, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, maxWidth: '48%' },
  chipOn: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  chipTxt: { fontSize: FONT.sizes.xs, color: COLORS.text },
  chipTxtOn: { fontWeight: FONT.weights.bold, color: COLORS.primary },
  picker: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACE.sm,
    backgroundColor: COLORS.surface,
    marginBottom: SPACE.xs,
  },
  pickerTxt: { fontSize: FONT.sizes.md, color: COLORS.text },
  pickerPlaceholder: { fontSize: FONT.sizes.md, color: COLORS.textDisabled },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACE.sm, fontSize: FONT.sizes.md, color: COLORS.text, backgroundColor: COLORS.surface },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  btn: { backgroundColor: COLORS.primary, padding: SPACE.md, borderRadius: RADIUS.md, alignItems: 'center', marginTop: SPACE.md },
  btnTxt: { color: '#FFF', fontWeight: FONT.weights.bold },
  misWrap: { minHeight: 280, maxHeight: 480 },
  misList: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  empty: { textAlign: 'center', color: COLORS.textDisabled, marginTop: SPACE.lg },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  cardTit: { fontWeight: FONT.weights.bold, color: COLORS.text },
  cardSub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  appRow: { marginTop: SPACE.sm, paddingTop: SPACE.sm, borderTopWidth: 1, borderColor: COLORS.divider },
  appName: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold },
  appMsg: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  aceptar: { backgroundColor: COLORS.success, padding: SPACE.sm, borderRadius: RADIUS.sm, marginTop: SPACE.sm, alignItems: 'center' },
  aceptarTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  salasTit: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: COLORS.text, marginTop: SPACE.sm, marginBottom: 4 },
  salaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderColor: COLORS.divider },
  salaInfo: { flex: 1 },
  salaName: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: COLORS.text },
  salaCerrada: { fontSize: FONT.sizes.xs, color: '#16a34a', marginTop: 2 },
  abrirChat: { backgroundColor: COLORS.primary, paddingHorizontal: SPACE.md, paddingVertical: 8, borderRadius: RADIUS.sm },
  abrirChatTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  ratingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: SPACE.sm, paddingVertical: 8, paddingHorizontal: SPACE.md,
    backgroundColor: '#fffbeb', borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: '#fde68a', alignSelf: 'flex-start',
  },
  ratingBtnTxt: { color: '#b45309', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: SPACE.sm, paddingVertical: 8, paddingHorizontal: SPACE.md,
    backgroundColor: '#eff6ff', borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: '#bfdbfe', alignSelf: 'flex-start',
  },
  mapBtnTxt: { color: '#1d4ed8', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  linkChat: {
    marginTop: SPACE.md,
    padding: SPACE.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  linkChatTxt: { color: COLORS.primary, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  modoRow: { flexDirection: 'row', gap: 8, marginBottom: SPACE.sm },
  modoChip: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  modoChipOn: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  modoChipTxt: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, fontWeight: FONT.weights.semibold },
  modoChipTxtOn: { color: COLORS.primary, fontWeight: FONT.weights.bold },
  hintFlota: { fontSize: FONT.sizes.sm, color: COLORS.textDisabled, marginBottom: SPACE.sm },
  fleetRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    marginBottom: SPACE.xs,
    backgroundColor: COLORS.surface,
  },
  fleetRowOn: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  fleetRowDisabled: { opacity: 0.55, backgroundColor: '#F0F0F0' },
  fleetPlaca: { fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md, color: COLORS.text },
  fleetPlacaDisabled: { color: COLORS.textDisabled },
  fleetTipo: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  badgeInterno: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFF3E0',
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
    color: COLORS.warning,
  },
  cerrarInterno: {
    marginTop: SPACE.md,
    padding: SPACE.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cerrarInternoTxt: { color: COLORS.text, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
});
