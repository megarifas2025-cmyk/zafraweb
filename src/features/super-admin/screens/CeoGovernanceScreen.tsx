import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/shared/store/AuthContext';
import {
  listGovernanceUsers,
  type GovernanceFilter,
  type GovernanceUserRow,
  updateGovernanceUserStatus,
  logAdminAuditAction,
} from '@/features/super-admin/services/ceoAdminService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/shared/lib/supabase';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { FONT, RADIUS, SHADOW, SPACE } from '@/shared/utils/theme';
import { CeoBackdrop } from '@/features/super-admin/components/CeoBackdrop';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

const FILTERS: Array<{ key: GovernanceFilter; label: string }> = [
  { key: 'pending_kyc', label: 'KYC en revisión' },
  { key: 'blocked', label: 'Bloqueados' },
  { key: 'all', label: 'Todos' },
];

const DEBOUNCE_MS = 450;

function roleLabel(value: GovernanceUserRow['rol']) {
  switch (value) {
    case 'zafra_ceo':          return 'Zafra CEO';
    case 'company':            return 'Empresa';
    case 'perito':             return 'Perito';
    case 'independent_producer': return 'Productor';
    case 'buyer':              return 'Comprador';
    case 'transporter':        return 'Transportista';
    case 'agrotienda':         return 'Agrotienda';
    default: return value;
  }
}

function kycStatusLabel(value: GovernanceUserRow['kyc_estado']) {
  switch (value) {
    case 'verified':
      return 'KYC: Verificado';
    case 'rechazado':
      return 'KYC: Rechazado';
    case 'en_revision':
      return 'KYC: En revisión';
    case 'bloqueado':
      return 'KYC: Bloqueado';
    case 'pendiente':
    default:
      return 'KYC: Pendiente';
  }
}

export default function CeoGovernanceScreen() {
  const insets = useSafeAreaInsets();
  const { perfil } = useAuth();
  const [filter, setFilter] = useState<GovernanceFilter>('pending_kyc');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<GovernanceUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchCommittedRef = useRef('');

  const load = useCallback(async (term: string, activeFilter: GovernanceFilter) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await listGovernanceUsers(activeFilter, term);
      setRows(data.filter((row) => row.rol !== 'zafra_ceo'));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo cargar la lista de usuarios.';
      setErrorMsg(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Recarga inmediata cuando cambia el filtro
  useEffect(() => {
    void load(searchCommittedRef.current, filter);
  }, [filter, load]);

  // Debounce para la búsqueda: espera que el usuario deje de escribir
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearch(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        searchCommittedRef.current = text;
        void load(text, filter);
      }, DEBOUNCE_MS);
    },
    [filter, load],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefresh(true);
    await load(searchCommittedRef.current, filter);
    setRefresh(false);
  }, [load, filter]);

  const emptyText = useMemo(() => {
    if (filter === 'pending_kyc') return 'No hay usuarios pendientes de revisión.';
    if (filter === 'blocked') return 'No hay usuarios bloqueados.';
    return 'No hay usuarios con este criterio.';
  }, [filter]);

  const toggleBlock = (item: GovernanceUserRow) => {
    if (!perfil?.id) {
      Alert.alert('Gobierno', 'Tu sesión ejecutiva no está lista. Vuelve a entrar e intenta de nuevo.');
      return;
    }
    const nextBlocked = !item.bloqueado;
    const reason = nextBlocked
      ? 'Bloqueo administrativo desde cabina CEO'
      : 'Desbloqueo administrativo desde cabina CEO';
    Alert.alert(
      nextBlocked ? 'Bloquear usuario' : 'Desbloquear usuario',
      `${nextBlocked ? 'Se bloqueará' : 'Se desbloqueará'} a ${item.nombre}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: nextBlocked ? 'Bloquear' : 'Desbloquear',
          style: nextBlocked ? 'destructive' : 'default',
          onPress: () => {
            void updateGovernanceUserStatus(perfil.id, item, { bloqueado: nextBlocked }, reason)
              .then(() => {
                trackUiEvent({
                  eventType: 'submit',
                  eventName: nextBlocked ? 'ceo_user_blocked' : 'ceo_user_unblocked',
                  screen: 'CeoGovernance',
                  module: 'ceo_governance',
                  targetType: 'perfil',
                  targetId: item.id,
                  status: 'success',
                  metadata: { rol: item.rol },
                });
                return load(search, filter);
              })
              .catch((error) => {
                Alert.alert('Gobierno', error instanceof Error ? error.message : 'No se pudo actualizar el usuario.');
              });
          },
        },
      ],
    );
  };

  const approveKyc = (item: GovernanceUserRow) => {
    if (!perfil?.id) {
      Alert.alert('KYC', 'Tu sesión ejecutiva no está lista. Vuelve a entrar e intenta de nuevo.');
      return;
    }
    if (item.kyc_estado === 'verified') {
      Alert.alert('KYC', 'Este usuario ya está verificado.');
      return;
    }
    Alert.alert(
      'Aprobar verificación',
      `¿Aprobar KYC de ${item.nombre}? El usuario tendrá acceso completo a la plataforma.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprobar',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('perfiles')
                .update({ kyc_estado: 'verified', activo: true })
                .eq('id', item.id);
              if (error) throw error;
              await logAdminAuditAction({
                actorId: perfil.id,
                action: 'approve_kyc',
                targetTable: 'perfiles',
                targetId: item.id,
                targetLabel: item.nombre,
                reason: 'Verificación KYC aprobada desde cabina CEO',
                details: { rol: item.rol },
              });
              trackUiEvent({
                eventType: 'submit',
                eventName: 'ceo_kyc_approved',
                screen: 'CeoGovernance',
                module: 'ceo_governance',
                targetType: 'perfil',
                targetId: item.id,
                status: 'success',
                metadata: { rol: item.rol },
              });
              await load(search, filter);
            } catch (e) {
              Alert.alert('KYC', e instanceof Error ? e.message : 'No se pudo aprobar el KYC.');
            }
          },
        },
      ],
    );
  };

  const rejectKyc = (item: GovernanceUserRow) => {
    if (!perfil?.id) {
      Alert.alert('KYC', 'Tu sesión ejecutiva no está lista. Vuelve a entrar e intenta de nuevo.');
      return;
    }
    Alert.alert(
      'Rechazar verificación',
      `¿Rechazar KYC de ${item.nombre}? El usuario deberá reenviar sus documentos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('perfiles')
                .update({ kyc_estado: 'rechazado' })
                .eq('id', item.id);
              if (error) throw error;
              await logAdminAuditAction({
                actorId: perfil.id,
                action: 'reject_kyc',
                targetTable: 'perfiles',
                targetId: item.id,
                targetLabel: item.nombre,
                reason: 'KYC rechazado desde cabina CEO',
                details: { rol: item.rol },
              });
              trackUiEvent({
                eventType: 'submit',
                eventName: 'ceo_kyc_rejected',
                screen: 'CeoGovernance',
                module: 'ceo_governance',
                targetType: 'perfil',
                targetId: item.id,
                status: 'success',
                metadata: { rol: item.rol },
              });
              await load(search, filter);
            } catch (e) {
              Alert.alert('KYC', e instanceof Error ? e.message : 'No se pudo rechazar el KYC.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={s.root}>
      <CeoBackdrop />
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[s.content, { paddingTop: Math.max(insets.top, SPACE.md) }]}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={onRefresh} tintColor={CEO_COLORS.emerald} />}
        ListHeaderComponent={
          <View style={s.header}>
            <Text style={s.title}>Gobierno de usuarios</Text>
            <Text style={s.subtitle}>Supervisión de cuentas, operación y estatus administrativo.</Text>

            {errorMsg ? (
              <View style={s.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={CEO_COLORS.red} />
                <Text style={s.errorTxt}>{errorMsg}</Text>
              </View>
            ) : null}

            <View style={s.filterRow}>
              {FILTERS.map((item) => {
                const active = item.key === filter;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[s.filterChip, active && s.filterChipOn]}
                    onPress={() => setFilter(item.key)}
                  >
                    <Text style={[s.filterChipTxt, active && s.filterChipTxtOn]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={s.searchShell}>
              <Ionicons name="search-outline" size={18} color={CEO_COLORS.emerald} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={handleSearchChange}
                placeholder="Buscar por nombre, teléfono o documento"
                placeholderTextColor={CEO_COLORS.textMute}
              />
              {search.length > 0 ? (
                <TouchableOpacity onPress={() => handleSearchChange('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={CEO_COLORS.textMute} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: SPACE.xl }} color={CEO_COLORS.emerald} />
          ) : (
            <Text style={s.empty}>{emptyText}</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={[s.card, item.bloqueado ? s.cardDanger : item.kyc_estado !== 'verified' ? s.cardWarning : s.cardSuccess]}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.nombre}</Text>
                <Text style={s.meta}>
                  {roleLabel(item.rol)} • {item.estado_ve}
                  {item.municipio ? ` • ${item.municipio}` : ''}
                </Text>
              </View>
              <View style={s.avatarFake}>
                <Ionicons name="people-outline" size={16} color={CEO_COLORS.textSoft} />
              </View>
            </View>

            <View style={s.badgeRow}>
              <View style={[s.badge, item.kyc_estado === 'verified' ? s.badgeSuccess : item.kyc_estado === 'rechazado' ? s.badgeDanger : s.badgeWarning]}>
                <Text style={[s.badgeTxt, item.kyc_estado === 'verified' ? s.badgeTxtSuccess : item.kyc_estado === 'rechazado' ? s.badgeTxtDanger : s.badgeTxtWarning]}>
                  {kycStatusLabel(item.kyc_estado)}
                </Text>
              </View>
              <View style={[s.badge, item.bloqueado ? s.badgeDanger : s.badgeSuccess]}>
                <Text style={[s.badgeTxt, item.bloqueado ? s.badgeTxtDanger : s.badgeTxtSuccess]}>
                  {item.bloqueado ? 'Bloqueado' : 'Activo'}
                </Text>
              </View>
            </View>

            <View style={s.actionsRow}>
              {/* Acciones KYC */}
              {item.kyc_estado !== 'verified' ? (
                <TouchableOpacity style={[s.actionBtn, s.actionBtnSafe]} onPress={() => approveKyc(item)}>
                  <Ionicons name="checkmark-outline" size={13} color="#fff" />
                  <Text style={s.actionTxt}>Aprobar</Text>
                </TouchableOpacity>
              ) : null}
              {item.kyc_estado === 'pendiente' || item.kyc_estado === 'en_revision' ? (
                <TouchableOpacity style={[s.actionBtn, s.actionBtnWarn]} onPress={() => rejectKyc(item)}>
                  <Ionicons name="close-outline" size={13} color="#fff" />
                  <Text style={s.actionTxt}>Rechazar</Text>
                </TouchableOpacity>
              ) : null}
              {/* Bloqueo */}
              <TouchableOpacity
                style={[s.actionBtn, item.bloqueado ? s.actionBtnSafe : s.actionBtnDanger]}
                onPress={() => toggleBlock(item)}
              >
                <Ionicons name={item.bloqueado ? 'lock-open-outline' : 'lock-closed-outline'} size={13} color="#fff" />
                <Text style={s.actionTxt}>{item.bloqueado ? 'Desbloquear' : 'Bloquear'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  content: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  header: { marginBottom: SPACE.md },
  title: { fontSize: 24, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  subtitle: { marginTop: 6, fontSize: FONT.sizes.sm, color: CEO_COLORS.textSoft, lineHeight: 20 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACE.sm,
    padding: SPACE.sm,
    backgroundColor: 'rgba(220,38,38,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.3)',
  },
  errorTxt: { flex: 1, color: CEO_COLORS.red, fontSize: FONT.sizes.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACE.md, marginBottom: SPACE.md },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  filterChipOn: { backgroundColor: CEO_COLORS.panelSoft, borderColor: CEO_COLORS.emerald },
  filterChipTxt: { color: CEO_COLORS.textMute, fontSize: FONT.sizes.sm, fontWeight: FONT.weights.medium },
  filterChipTxtOn: { color: CEO_COLORS.emerald, fontWeight: FONT.weights.bold },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 12, color: CEO_COLORS.text },
  card: {
    borderRadius: 24,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    backgroundColor: CEO_COLORS.panel,
    borderWidth: 1,
    ...SHADOW.sm,
  },
  cardWarning: { borderColor: 'rgba(251,191,36,0.28)', backgroundColor: 'rgba(120,53,15,0.18)' },
  cardDanger:  { borderColor: 'rgba(248,113,113,0.28)', backgroundColor: 'rgba(127,29,29,0.18)' },
  cardSuccess: { borderColor: 'rgba(52,211,153,0.2)' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  avatarFake: {
    width: 40, height: 40, borderRadius: 999, borderWidth: 1,
    borderColor: CEO_COLORS.border, backgroundColor: 'rgba(15,23,42,0.74)',
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: CEO_COLORS.text },
  meta: { marginTop: 4, fontSize: FONT.sizes.sm, color: CEO_COLORS.textSoft },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, backgroundColor: 'rgba(2,6,23,0.45)',
  },
  badgeSuccess: { borderColor: 'rgba(52,211,153,0.22)' },
  badgeWarning: { borderColor: 'rgba(251,191,36,0.22)' },
  badgeDanger:  { borderColor: 'rgba(248,113,113,0.22)' },
  badgeTxt: { fontSize: 10, fontWeight: FONT.weights.bold, textTransform: 'uppercase', letterSpacing: 0.8 },
  badgeTxtSuccess: { color: CEO_COLORS.emerald },
  badgeTxtWarning: { color: CEO_COLORS.amber },
  badgeTxtDanger:  { color: CEO_COLORS.red },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SPACE.md },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.md,
  },
  actionBtnDanger: { backgroundColor: 'rgba(185,28,28,0.92)' },
  actionBtnSafe:   { backgroundColor: 'rgba(5,150,105,0.92)' },
  actionBtnWarn:   { backgroundColor: 'rgba(180,83,9,0.92)' },
  actionTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  empty: { marginTop: SPACE.xl, color: CEO_COLORS.textSoft },
});
