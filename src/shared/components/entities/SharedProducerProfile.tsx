import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { SharedProducerProfileBody } from '@/shared/entities/producer-profile/SharedProducerProfileBody';
import {
  resolveProducerProfileAccess,
  type ProducerProfileAccessContext,
} from '@/shared/entities/producer-profile/producerProfileAccess';
import { getRestrictedActionMessage } from '@/shared/lib/accountStatus';
import { getProducerProfileSnapshot, type ProducerProfileSnapshot } from '@/shared/services/producerProfileService';
import { chatService } from '@/shared/services/chatService';
import { obtenerPromedioCalificaciones } from '@/shared/services/ratingsService';
import { supabase } from '@/shared/lib/supabase';
import { COLORS, FONT, SHADOW, SPACE } from '@/shared/utils/theme';

export type SharedProducerProfileProps = {
  producerId: string;
  /** Fuerza el modo de vista (p. ej. desde CompanyStack con company_view). */
  accessContext?: ProducerProfileAccessContext;
};

type CosechaHistorialRow = {
  id: string;
  rubro: string | null;
  estado: string | null;
  cantidad_kg: number | null;
  creado_en: string | null;
};

export function SharedProducerProfile({ producerId, accessContext }: SharedProducerProfileProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { role: viewerRole, perfil: viewerPerfil } = useAppStore(
    useShallow((s) => ({ role: s.role, perfil: s.perfil })),
  );

  const [snapshot, setSnapshot] = useState<ProducerProfileSnapshot | null>(null);
  const [historial, setHistorial] = useState<CosechaHistorialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [rating, setRating] = useState<{ promedio: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    void (async () => {
      try {
        const snap = await getProducerProfileSnapshot(producerId);
        if (cancelled) return;
        setSnapshot(snap);
        // Cargar calificaciones en paralelo
        obtenerPromedioCalificaciones(producerId)
          .then((r) => { if (!cancelled) setRating(r); })
          .catch(() => undefined);

        const { data: rows, error: hErr } = await supabase
          .from('cosechas')
          .select('id, rubro, estado, cantidad_kg, creado_en')
          .eq('agricultor_id', producerId)
          .order('creado_en', { ascending: false })
          .limit(8);

        if (!cancelled) {
          if (!hErr && rows) setHistorial(rows as CosechaHistorialRow[]);
          else setHistorial([]);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setSnapshot(null);
        setErrorMsg(e instanceof Error ? e.message : 'No se pudo cargar el perfil del productor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [producerId]);

  const access = useMemo(
    () =>
      resolveProducerProfileAccess({
        viewerRole,
        viewerId: viewerPerfil?.id,
        producerId: snapshot?.producer.id ?? producerId,
        requestedContext: accessContext,
      }),
    [viewerRole, viewerPerfil?.id, snapshot?.producer.id, producerId, accessContext],
  );

  const isOwner =
    !!viewerPerfil?.id &&
    viewerPerfil.id === producerId &&
    viewerRole === 'independent_producer';

  const showExternalKpis =
    !isOwner &&
    (viewerRole === 'company' ||
      viewerRole === 'buyer' ||
      viewerRole === 'zafra_ceo' ||
      accessContext === 'company_view' ||
      accessContext === 'buyer_view' ||
      accessContext === 'zafra_ceo_view');

  const navigateToOwnProfileTab = useCallback(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate('Perfil' as never);
      return;
    }
    navigation.navigate('Perfil' as never);
  }, [navigation]);

  const onContactarOChat = useCallback(async () => {
    if (!viewerPerfil?.id || viewerPerfil.id === producerId) return;

    if (viewerRole === 'buyer') {
      const restriction = getRestrictedActionMessage(viewerPerfil);
      if (restriction) {
        Alert.alert('Cuenta', restriction);
        return;
      }
      setChatBusy(true);
      try {
        const sala = await chatService.crearSala(viewerPerfil.id, producerId);
        const tabNav = navigation.getParent();
        const nav = tabNav ?? navigation;
        (nav as unknown as { navigate: (n: string, p?: object) => void }).navigate('Chat', {
          openCosechaSalaId: sala.id,
        });
      } catch (e: unknown) {
        Alert.alert('Chat', e instanceof Error ? e.message : 'No se pudo abrir el chat.');
      } finally {
        setChatBusy(false);
      }
      return;
    }

    if (snapshot?.producer.telefono) {
      const tel = snapshot.producer.telefono.replace(/\s/g, '');
      const url = `tel:${tel}`;
      const can = await Linking.canOpenURL(url);
      if (can) void Linking.openURL(url);
      else Alert.alert('Contacto', 'No se pudo abrir el marcador.');
      return;
    }

    Alert.alert(
      'Contacto',
      'No hay teléfono disponible en este contexto. Usa el chat de mercado si eres comprador o revisa la ficha desde empresa.',
    );
  }, [viewerPerfil?.id, viewerRole, producerId, navigation, snapshot?.producer.telefono]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.muted}>Cargando productor…</Text>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Perfil no disponible</Text>
        <Text style={styles.errorMsg}>{errorMsg ?? 'No se pudo resolver la ficha del productor.'}</Text>
      </View>
    );
  }

  const p = snapshot.producer;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: Math.max(insets.top, 12),
        paddingBottom: SPACE.xxl + 24,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.headerCard}>
        <Text style={styles.brand}>Productor</Text>
        <Text style={styles.title}>{p.nombre}</Text>
        {rating && rating.total > 0 ? (
          <View style={styles.ratingBadge}>
            {'⭐'.repeat(Math.round(rating.promedio))}
            <Text style={styles.ratingText}>
              {' '}{rating.promedio.toFixed(1)} ({rating.total} {rating.total === 1 ? 'calificación' : 'calificaciones'})
            </Text>
          </View>
        ) : null}
        <Text style={styles.subtitle}>
          {isOwner
            ? 'Tu perfil público'
            : access.context === 'company_view'
              ? 'Vista empresa'
              : access.context === 'buyer_view'
                ? 'Vista comprador'
                : access.context === 'zafra_ceo_view'
                  ? 'Vista administrativa'
                  : 'Vista de consulta'}
        </Text>
      </View>

      {showExternalKpis ? (
        <View style={styles.kpiRow}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiVal}>⭐ {p.reputacion?.toFixed(1) ?? '—'}</Text>
            <Text style={styles.kpiLbl}>Reputación</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiVal}>{p.total_tratos ?? 0}</Text>
            <Text style={styles.kpiLbl}>Operaciones</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiVal}>{p.trust_score ?? '—'}</Text>
            <Text style={styles.kpiLbl}>Trust</Text>
          </View>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiVal}>{p.zafras_completadas ?? 0}</Text>
            <Text style={styles.kpiLbl}>Zafras</Text>
          </View>
        </View>
      ) : null}

      {isOwner ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.btnPrimary} onPress={navigateToOwnProfileTab} activeOpacity={0.85}>
            <Text style={styles.btnPrimaryTxt}>Editar perfil</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={navigateToOwnProfileTab}
            activeOpacity={0.85}
          >
            <Text style={styles.btnSecondaryTxt}>Configuración</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.btnPrimary, chatBusy && styles.btnDisabled]}
            onPress={() => void onContactarOChat()}
            disabled={chatBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryTxt}>
              {viewerRole === 'buyer' ? (chatBusy ? 'Abriendo chat…' : 'Chat') : 'Contactar'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <SharedProducerProfileBody
        producer={p}
        access={access}
        affiliations={snapshot.affiliations}
        financedLots={snapshot.financedLots}
      />

      {historial.length > 0 ? (
        <View style={styles.historyCard}>
          <Text style={styles.historyTitle}>Historial reciente (cosechas)</Text>
          {historial.map((row) => (
            <View key={row.id} style={styles.historyRow}>
              <Text style={styles.historyRubro}>{row.rubro ?? 'Cosecha'}</Text>
              <Text style={styles.historyMeta}>
                {row.estado ?? '—'}
                {row.cantidad_kg != null ? ` · ${row.cantidad_kg} kg` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDFBF7' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FDFBF7',
    padding: 24,
  },
  muted: { marginTop: 10, color: COLORS.textSecondary, fontSize: FONT.sizes.sm },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  brand: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 10,
    fontSize: FONT.sizes.xl,
    fontWeight: FONT.weights.bold,
    color: COLORS.text,
  },
  subtitle: {
    marginTop: 6,
    color: COLORS.textSecondary,
    fontSize: FONT.sizes.sm,
    lineHeight: 20,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  ratingText: {
    fontSize: FONT.sizes.sm,
    color: '#b45309',
    fontWeight: '600',
  },
  kpiRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    justifyContent: 'space-between',
    ...SHADOW.sm,
  },
  kpiCell: { flex: 1, alignItems: 'center' },
  kpiVal: { fontSize: FONT.sizes.md, fontWeight: '800', color: COLORS.text },
  kpiLbl: { marginTop: 4, fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase' },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
  },
  btnPrimary: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: FONT.sizes.md },
  btnSecondary: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  btnSecondaryTxt: { color: COLORS.primary, fontWeight: '800', fontSize: FONT.sizes.md },
  btnDisabled: { opacity: 0.6 },
  historyCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  historyTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  historyRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e7e5e4',
  },
  historyRubro: { fontSize: FONT.sizes.md, fontWeight: '800', color: COLORS.text },
  historyMeta: { marginTop: 4, fontSize: FONT.sizes.sm, color: COLORS.textSecondary },
  errorTitle: {
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  errorMsg: {
    marginTop: 10,
    fontSize: FONT.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
