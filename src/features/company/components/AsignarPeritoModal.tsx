import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '@/shared/lib/supabase';
import { createFieldInspectionForCompany } from '@/shared/services/fieldInspectionService';
import { FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const SLATE = '#0F172A';
const GOLD = '#FBBF24';
const CREAM = '#FDFBF7';

type EmpleadoRow = {
  id: string;
  perfil_id: string;
  perfiles: { nombre: string | null; rol: string } | null;
};

function embedPerfiles(raw: unknown): { nombre: string | null; rol: string } | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' && first !== null && 'rol' in first
      ? (first as { nombre: string | null; rol: string })
      : null;
  }
  if (typeof raw === 'object' && raw !== null && 'rol' in raw) {
    return raw as { nombre: string | null; rol: string };
  }
  return null;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  companyId: string;
  productorId: string;
  fincaId?: string | null;
  fechaProgramada?: string | null;
  /** Contexto para el mensaje (rubro / finca) */
  contexto: string;
  inspectionType?: 'estimacion_precosecha' | 'evaluacion_danos' | 'auditoria_insumos' | 'certificacion_calidad' | 'seguimiento_tecnico';
  onCreated?: () => void;
};

function nextBusinessDate(seed?: string | null): string {
  const base = seed ? new Date(seed) : new Date();
  if (Number.isNaN(base.getTime())) {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    return now.toISOString().slice(0, 10);
  }
  return base.toISOString().slice(0, 10);
}

export function AsignarPeritoModal({
  visible,
  onClose,
  companyId,
  productorId,
  fincaId,
  fechaProgramada,
  contexto,
  inspectionType = 'estimacion_precosecha',
  onCreated,
}: Props) {
  const [rows, setRows] = useState<EmpleadoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_employees')
        .select('id, perfil_id, perfiles(nombre, rol)')
        .eq('company_id', companyId)
        .eq('activo', true);
      if (error) throw error;
      const list: EmpleadoRow[] = (data ?? []).map((r: { id: string; perfil_id: string; perfiles: unknown }) => ({
        id: r.id,
        perfil_id: r.perfil_id,
        perfiles: embedPerfiles(r.perfiles),
      }));
      setRows(list.filter((row) => (row.perfiles?.rol ?? '') === 'perito'));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const asignar = async (e: EmpleadoRow) => {
    const nombre = e.perfiles?.nombre ?? 'Perito';
    setAssigningId(e.id);
    try {
      const fecha = nextBusinessDate(fechaProgramada);
      const created = await createFieldInspectionForCompany({
        empresa_id: companyId,
        perito_id: e.perfil_id,
        productor_id: productorId,
        finca_id: fincaId ?? null,
        fecha_programada: fecha,
        tipo_inspeccion: inspectionType,
        observaciones_tecnicas: `Orden creada desde empresa para: ${contexto}`,
      });
      Alert.alert(
        created.reused ? 'Inspección existente' : 'Inspección creada',
        created.reused
          ? `${nombre} ya tenía una inspección abierta para este productor.\n\nControl: ${created.numero_control}`
          : `${nombre} fue asignado correctamente.\n\nControl: ${created.numero_control}\nFecha programada: ${fecha}`,
        [{ text: 'Entendido', onPress: onClose }],
      );
      onCreated?.();
    } catch (error: unknown) {
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo crear la inspección.');
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity style={m.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={m.sheet} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <Text style={m.title}>Asignar perito</Text>
          <Text style={m.sub}>Al seleccionar un perito se crea una inspección real en `field_inspections` para este lote/productor.</Text>
          <View style={m.infoBox}>
            <Text style={m.infoStrong}>Programación:</Text>
            <Text style={m.infoTxt}> {nextBusinessDate(fechaProgramada)} · {contexto}</Text>
          </View>
          {loading ? (
            <ActivityIndicator color={GOLD} style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(it) => it.id}
              style={{ maxHeight: 280 }}
              ListEmptyComponent={<Text style={m.empty}>No hay peritos vinculados. Gestiona la plantilla en Peritos.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={m.row} onPress={() => void asignar(item)} activeOpacity={0.88} disabled={assigningId != null}>
                  <Text style={m.rowName}>{item.perfiles?.nombre ?? 'Sin nombre'}</Text>
                  <Text style={m.rowHint}>
                    {assigningId === item.id ? 'Creando inspección…' : 'Disponible para inspección'}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity style={m.btnClose} onPress={onClose}>
            <Text style={m.btnCloseTxt}>Cancelar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    padding: SPACE.lg,
  },
  sheet: {
    backgroundColor: CREAM,
    borderRadius: 24,
    padding: SPACE.lg,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    ...SHADOW.lg,
  },
  title: {
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.heavy,
    color: SLATE,
    fontStyle: 'italic',
    textTransform: 'uppercase',
  },
  sub: { marginTop: 8, fontSize: FONT.sizes.sm, color: '#64748b', lineHeight: 20 },
  infoBox: {
    marginTop: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: RADIUS.md,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  infoStrong: { color: SLATE, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  infoTxt: { color: '#7c2d12', marginTop: 4, fontSize: FONT.sizes.sm, lineHeight: 18 },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    backgroundColor: SLATE,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowName: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
  rowHint: { color: GOLD, fontSize: 10, fontWeight: FONT.weights.bold, marginTop: 4, letterSpacing: 1 },
  empty: { textAlign: 'center', color: '#94a3b8', paddingVertical: 16 },
  btnClose: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  btnCloseTxt: { color: SLATE, fontWeight: FONT.weights.semibold },
});
