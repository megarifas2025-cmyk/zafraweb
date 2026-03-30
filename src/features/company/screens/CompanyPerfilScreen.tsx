/**
 * Perfil rol empresa — `diseños/empresa.txt` (cabecera corporativa, cuenta, datos fiscales).
 */
import React, { useCallback, useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { useCompany } from '../hooks/useCompany';
import { ProfileAccountSection } from '@/shared/components/ProfileAccountSection';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { getCommercialStatusLabel } from '@/shared/lib/accountStatus';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const SLATE_900 = '#0f172a';
const EMERALD = '#10b981';
const FOREST = '#0F3B25';
const CREAM = '#FDFBF7';

function useProfileBottomPad() {
  const insets = useSafeAreaInsets();
  const tabBarH = useContext(BottomTabBarHeightContext);
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
  if (typeof tabBarH === 'number' && tabBarH > 0) return tabBarH + 28;
  return 80 + safeBottom + 16;
}

type Props = {
  onDatosEmpresa: () => void;
};

export default function CompanyPerfilScreen({ onDatosEmpresa }: Props) {
  const insets = useSafeAreaInsets();
  const { perfil, isVerificado } = useAuth();
  const { company, loading, loadError, refresh } = useCompany();
  const scrollPad = useProfileBottomPad();
  const [refreshing, setRefreshing] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const goNotificaciones = () => setNotifModalVisible(true);

  const nombreEmpresa = company?.razon_social?.trim() || perfil?.nombre || 'Empresa';
  const avatarUrl = company?.logo_url?.trim() || perfil?.avatar_url?.trim() || null;
  const rif = company?.rif ?? '–';
  const sede = perfil?.estado_ve ? `Sede principal: ${perfil.estado_ve}` : 'Sede principal';

  return (
    <View style={s.root}>
      <View style={[s.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={s.topBarLeft}>
          <View style={s.avatarRing}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatarImg} resizeMode="cover" />
            ) : (
              <View style={s.avatarPh}>
                <Text style={s.avatarLetter}>{nombreEmpresa[0]?.toUpperCase() ?? 'E'}</Text>
              </View>
            )}
            {isVerificado ? (
              <View style={s.verifiedDot}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            ) : null}
          </View>
          <View style={s.topBarText}>
            <Text style={s.topName} numberOfLines={1}>
              {nombreEmpresa}
            </Text>
            <Text style={s.topRole}>Administrador</Text>
          </View>
        </View>
        <View style={s.topActions}>
          <TouchableOpacity style={s.bellBtn} onPress={goNotificaciones} accessibilityLabel="Notificaciones">
            <Ionicons name="notifications-outline" size={22} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity style={s.bellBtn} onPress={() => void authService.logout()} accessibilityLabel="Cerrar sesión">
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollInner, { paddingBottom: scrollPad }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={onRefresh} tintColor={FOREST} />}
      >
        <View style={s.portalRow}>
          <View style={s.portalBar} />
          <Text style={s.portalTxt}>Portal B2B</Text>
        </View>

        <View style={s.hero}>
          <Text style={s.watermark}>🏢</Text>
          <View style={s.heroRow}>
            <View style={[s.badgeVer, { marginRight: 8 }]}>
              <Text style={s.badgeVerTxt}>{isVerificado ? 'Operativa' : getCommercialStatusLabel(perfil)}</Text>
            </View>
            <Text style={s.rifSmall}>RIF: {rif}</Text>
          </View>
          <Text style={s.heroTitle}>{nombreEmpresa}</Text>
          <View style={s.sedeRow}>
            <Ionicons name="location-outline" size={12} color="#94a3b8" style={{ marginRight: 6 }} />
            <Text style={s.sedeTxt}>{sede}</Text>
          </View>
          <View style={s.liveStrip}>
            <View style={s.liveLeft}>
              <View style={s.pingWrap}>
                <View style={s.pingOuter} />
                <View style={s.pingInner} />
              </View>
              <Text style={s.liveLabel}>Operaciones</Text>
            </View>
            <Text style={s.liveVal} numberOfLines={1}>
              {loading && !company ? 'Cargando…' : company ? getCommercialStatusLabel(perfil) : 'Alta corporativa pendiente'}
            </Text>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTit}>Datos de contacto</Text>
          <Text style={s.infoRow}>Teléfono: {perfil?.telefono ?? company?.telefono_contacto ?? '–'}</Text>
          <Text style={s.infoRow}>Correo: {company?.correo_contacto ?? '–'}</Text>
          <Text style={s.infoRow}>Municipio: {perfil?.municipio ?? '–'}</Text>
        </View>
        {loadError ? (
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Perfil corporativo incompleto</Text>
            <Text style={s.errorText}>{loadError}</Text>
            <TouchableOpacity style={s.errorBtn} onPress={onDatosEmpresa} activeOpacity={0.88}>
              <Text style={s.errorBtnTxt}>{company ? 'Completar datos' : 'Crear perfil de empresa'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <ProfileAccountSection />

        <TouchableOpacity style={s.btnEmpresa} onPress={onDatosEmpresa} activeOpacity={0.88}>
          <View style={s.btnEmpresaIcon}>
            <Ionicons name="business-outline" size={22} color={FOREST} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.btnEmpresaTit}>{company ? 'Datos de empresa' : 'Crear empresa'}</Text>
            <Text style={s.btnEmpresaSub}>
              {company ? 'RIF, razón social, fiscal, contacto y logo' : 'Completa el alta formal de tu empresa para operar en la app'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textDisabled} />
        </TouchableOpacity>

      </ScrollView>
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => setNotifModalVisible(false)}
        userId={perfil?.id}
        companyId={company?.id}
        subtitle="Fletes, inspecciones y avisos de tu empresa"
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  topActions: { flexDirection: 'row', gap: 8 },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  avatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(15,23,42,0.15)',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPh: {
    flex: 1,
    backgroundColor: SLATE_900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 18, fontWeight: '900' },
  verifiedDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: EMERALD,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarText: { marginLeft: 12, flex: 1, minWidth: 0 },
  topName: {
    fontSize: 14,
    fontWeight: '900',
    fontStyle: 'italic',
    color: SLATE_900,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  topRole: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
    marginTop: 4,
  },
  bellBtn: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: 20, paddingTop: 16 },
  portalRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  portalBar: { width: 4, height: 18, borderRadius: 4, backgroundColor: SLATE_900, marginRight: 8 },
  portalTxt: {
    fontSize: 11,
    fontWeight: '900',
    color: SLATE_900,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  hero: {
    backgroundColor: SLATE_900,
    borderRadius: 28,
    padding: 22,
    marginBottom: 20,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  watermark: {
    position: 'absolute',
    right: -20,
    top: -16,
    fontSize: 120,
    opacity: 0.08,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 },
  badgeVer: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  badgeVerTxt: { fontSize: 9, fontWeight: '900', color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: 1.5 },
  rifSmall: { fontSize: 9, fontWeight: '800', color: '#94a3b8' },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#fff',
    letterSpacing: -0.5,
  },
  sedeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  sedeTxt: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  liveStrip: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  liveLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pingWrap: { width: 12, height: 12, justifyContent: 'center', alignItems: 'center' },
  pingOuter: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34d399',
    opacity: 0.5,
  },
  pingInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34d399' },
  liveLabel: { fontSize: 10, fontWeight: '900', color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: 2 },
  liveVal: { flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '900', color: '#fff', textAlign: 'right' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  cardTit: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoRow: { fontSize: FONT.sizes.sm, paddingVertical: 6, color: COLORS.text, fontWeight: '600' },
  errorCard: {
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fdba74',
    ...SHADOW.sm,
  },
  errorTitle: { color: '#9a3412', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  errorText: { color: '#7c2d12', marginTop: 8, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  errorBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: SLATE_900,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  btnEmpresa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.md,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  btnEmpresaIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  btnEmpresaTit: { fontSize: FONT.sizes.md, fontWeight: '800', color: COLORS.text },
  btnEmpresaSub: { fontSize: FONT.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
});
