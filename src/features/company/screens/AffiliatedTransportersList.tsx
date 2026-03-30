import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useCompany } from '../hooks/useCompany';
import {
  listTransporterLinksForCompany,
  respondTransporterCompanyLink,
} from '@/shared/services/transporterCompanyLinkService';
import { supabase } from '@/shared/lib/supabase';
import { freightTrackingStatusLabel } from '@/shared/services/freightRequestsService';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';
import type { TransporterCompanyLink } from '@/shared/types';

type TransporterOpsSummary = {
  activeCount: number;
  latestStatus: string | null;
};

export default function AffiliatedTransportersList() {
  const { company } = useCompany();
  const [rows, setRows] = useState<TransporterCompanyLink[]>([]);
  const [refresh, setRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [opsByTransporter, setOpsByTransporter] = useState<Record<string, TransporterOpsSummary>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!company?.id) {
      setRows([]);
      setLoading(false);
      setErrorMsg(null);
      return;
    }
    try {
      setErrorMsg(null);
      const links = await listTransporterLinksForCompany(company.id);
      setRows(links);
      const approvedIds = links.filter((item) => item.status === 'approved').map((item) => item.transporter_id);
      if (!approvedIds.length) {
        setOpsByTransporter({});
        return;
      }
      const { data, error: freightErr } = await supabase
        .from('freight_requests')
        .select('assigned_transportista_id, tracking_status')
        .eq('requester_id', company.perfil_id)
        .eq('estado', 'asignada')
        .in('assigned_transportista_id', approvedIds);
      const summary: Record<string, TransporterOpsSummary> = {};
      if (freightErr) { setOpsByTransporter(summary); return; }
      for (const row of (data ?? []) as Array<{ assigned_transportista_id: string | null; tracking_status?: string | null }>) {
        const tid = row.assigned_transportista_id;
        if (!tid) continue;
        if (!summary[tid]) summary[tid] = { activeCount: 0, latestStatus: row.tracking_status ?? null };
        summary[tid].activeCount += 1;
        summary[tid].latestStatus = row.tracking_status ?? summary[tid].latestStatus;
      }
      setOpsByTransporter(summary);
    } catch {
      setRows([]);
      setOpsByTransporter({});
      setErrorMsg('No se pudo cargar la red de transportistas aliados.');
    } finally {
      setLoading(false);
    }
  }, [company?.id, company?.perfil_id]);

  useEffect(() => {
    setLoading(true);
    void cargar();
  }, [cargar]);

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

  const pending = useMemo(() => rows.filter((item) => item.status === 'pending'), [rows]);
  const approved = useMemo(() => rows.filter((item) => item.status === 'approved'), [rows]);

  async function responder(linkId: string, accept: boolean) {
    setActingId(linkId);
    try {
      await respondTransporterCompanyLink(linkId, accept);
      await cargar();
    } catch (error: unknown) {
      Alert.alert('Transportistas', error instanceof Error ? error.message : 'No se pudo actualizar la solicitud.');
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={[...pending, ...approved]}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      contentContainerStyle={s.list}
      ListEmptyComponent={
        <Text style={s.empty}>
          {company?.id
            ? 'Sin solicitudes ni transportistas aliados aún. Cuando apruebes alianzas de transporte aparecerán aquí.'
            : 'Completa primero el perfil de empresa para habilitar la red de transportistas aliados.'}
        </Text>
      }
      ListHeaderComponent={
        <View>
          <Text style={s.title}>Transportistas aliados</Text>
          <Text style={s.subtitle}>Aprueba solicitudes y monitorea quién ya está operando con tu empresa.</Text>
          {errorMsg ? (
            <View style={s.errorBanner}>
              <Text style={s.errorTxt}>{errorMsg}</Text>
            </View>
          ) : null}
          <View style={s.summary}>
            <View style={s.summaryCard}>
              <Text style={s.summaryValue}>{pending.length}</Text>
              <Text style={s.summaryLabel}>Pendientes por aprobar</Text>
            </View>
            <View style={s.summaryCard}>
              <Text style={s.summaryValue}>{approved.length}</Text>
              <Text style={s.summaryLabel}>Aliados aprobados</Text>
            </View>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={s.card}>
          <Text style={s.badge}>{item.status === 'pending' ? 'Solicitud pendiente' : 'Aliado aprobado'}</Text>
          <Text style={s.nombre}>{item.transporter?.nombre ?? 'Transportista'}</Text>
          <Text style={s.meta}>{item.transporter?.telefono ?? 'Sin teléfono'} · {item.transporter?.municipio ?? 'Sin municipio'}</Text>
          <Text style={s.meta}>Creado: {item.creado_en?.slice(0, 16)?.replace('T', ' ') ?? '—'}</Text>
          {item.status === 'approved' ? (
            <Text style={s.meta}>
              Operación actual: {opsByTransporter[item.transporter_id]?.activeCount ?? 0} servicio(s)
              {opsByTransporter[item.transporter_id]?.latestStatus
                ? ` · ${freightTrackingStatusLabel((opsByTransporter[item.transporter_id]?.latestStatus as never) ?? null)}`
                : ' · sin viaje activo'}
            </Text>
          ) : null}
          {item.status === 'pending' ? (
            <View style={s.actions}>
              <TouchableOpacity
                style={[s.btn, s.btnGhost]}
                onPress={() => void responder(item.id, false)}
                disabled={actingId === item.id}
                activeOpacity={0.88}
              >
                <Text style={[s.btnTxt, s.btnGhostTxt]}>Rechazar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btn}
                onPress={() => void responder(item.id, true)}
                disabled={actingId === item.id}
                activeOpacity={0.88}
              >
                {actingId === item.id ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Aprobar</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: COLORS.background },
  list: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  title: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: COLORS.text, marginBottom: 4 },
  subtitle: { color: COLORS.textSecondary, fontSize: FONT.sizes.sm, lineHeight: 20, marginBottom: SPACE.md },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    marginBottom: SPACE.md,
  },
  errorTxt: { color: '#B91C1C', fontSize: FONT.sizes.sm },
  empty: { color: COLORS.textDisabled, textAlign: 'center', marginTop: SPACE.xl },
  summary: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.md },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    ...SHADOW.sm,
  },
  summaryValue: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: COLORS.text },
  summaryLabel: { marginTop: 4, color: COLORS.textSecondary, fontSize: FONT.sizes.sm },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.sm, ...SHADOW.sm },
  badge: { fontSize: FONT.sizes.xs, color: COLORS.primary, fontWeight: FONT.weights.bold, marginBottom: 4 },
  nombre: { fontWeight: FONT.weights.semibold, fontSize: FONT.sizes.md, color: COLORS.text },
  meta: { marginTop: 4, color: COLORS.textSecondary, fontSize: FONT.sizes.sm },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  btnGhost: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  btnGhostTxt: { color: COLORS.text },
});
