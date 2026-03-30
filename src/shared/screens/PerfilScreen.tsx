import React, { useContext, useEffect, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RemoteImage } from '@/shared/components/RemoteImage';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/shared/store/AuthContext';
import { authService } from '@/shared/services/authService';
import { COLORS, FONT, SPACE, SHADOW } from '@/shared/utils/theme';
import { NotificationsCenterModal } from '@/shared/components/NotificationsCenterModal';
import { SharedProducerProfileBody } from '@/shared/entities/producer-profile/SharedProducerProfileBody';
import { resolveProducerProfileAccess } from '@/shared/entities/producer-profile/producerProfileAccess';
import { logWarn } from '@/shared/runtime/appLogger';
import { listAffiliationsForProducer, type CompanyAffiliation } from '@/shared/services/companyAffiliationsService';
import { listarFinanciamientosComoProductor, type LoteFinanciadoProductor } from '@/shared/services/financingService';
import { BuyerIdentityHeader } from '@/features/buyer/components/BuyerIdentityHeader';
import { ProducerIdentityHeader } from '@/features/producer/components/ProducerIdentityHeader';
import { ProfileAccountSection } from '@/shared/components/ProfileAccountSection';
import { supabase } from '@/shared/lib/supabase';
import { getAccountStatusLabel } from '@/shared/lib/accountStatus';
import { contarNotificacionesFreightNoLeidas } from '@/shared/services/freightRequestsService';
import { contarMensajesMercadoNoLeidos } from '@/shared/services/chatService';
import { listarCalificacionesRecibidas } from '@/shared/services/ratingsService';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';
import type { RatingEntry, Vehiculo } from '@/shared/types';

const ROL_LABEL: Record<string, string> = { zafra_ceo: '🛡️ Zafra CEO', company: '🏢 Empresa', perito: '📋 Perito', independent_producer: '🌽 Productor', buyer: '🛒 Comprador', transporter: '🚛 Transportista', agrotienda: '🏪 Agrotienda' };

type Props = {
  /** Solo pestaña empresa: botón hacia el formulario fiscal (misma pantalla que otros roles). */
  extraActions?: ReactNode;
};

const BUYER_CREAM = '#FDFBF7';

/** Evita que la tab bar (sobre todo la custom del productor con FAB) tape filas y robe toques. */
function useProfileScrollBottomPad() {
  const insets = useSafeAreaInsets();
  const tabBarH = useContext(BottomTabBarHeightContext);
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);
  if (typeof tabBarH === 'number' && tabBarH > 0) return Math.min(tabBarH + 20, 88) + safeBottom;
  return 56 + safeBottom + 8;
}

export default function PerfilScreen({ extraActions }: Props) {
  const { perfil, isVerificado } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollBottomPad = useProfileScrollBottomPad();
  const [flota, setFlota] = useState<Vehiculo[]>([]);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [buyerUnreadNotifications, setBuyerUnreadNotifications] = useState(false);
  const [buyerRatings, setBuyerRatings] = useState<RatingEntry[]>([]);
  const [producerAffiliations, setProducerAffiliations] = useState<CompanyAffiliation[]>([]);
  const [producerFinancedLots, setProducerFinancedLots] = useState<LoteFinanciadoProductor[]>([]);

  useEffect(() => {
    if (perfil?.rol !== 'independent_producer' || !perfil.id) {
      setProducerAffiliations([]);
      setProducerFinancedLots([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      listAffiliationsForProducer(perfil.id),
      listarFinanciamientosComoProductor(perfil.id),
    ])
      .then(([rows, lots]) => {
        if (cancelled) return;
        setProducerAffiliations(rows.filter((row) => row.status === 'active'));
        setProducerFinancedLots(lots);
      })
      .catch(() => {
        if (cancelled) return;
        setProducerAffiliations([]);
        setProducerFinancedLots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [perfil?.rol, perfil?.id]);

  useEffect(() => {
    if (perfil?.rol !== 'buyer' || !perfil.id) {
      setBuyerUnreadNotifications(false);
      return;
    }
    let cancelled = false;
    void Promise.all([contarNotificacionesFreightNoLeidas(perfil.id), contarMensajesMercadoNoLeidos(perfil.id)])
      .then(([fr, chatN]) => {
        if (cancelled) return;
        setBuyerUnreadNotifications(fr > 0 || chatN > 0);
      })
      .catch(() => {
        if (cancelled) return;
        setBuyerUnreadNotifications(false);
      });
    return () => {
      cancelled = true;
    };
  }, [perfil?.rol, perfil?.id, notifModalVisible]);

  useEffect(() => {
    if (perfil?.rol !== 'buyer' || !perfil.id) {
      setBuyerRatings([]);
      return;
    }
    let cancelled = false;
    void listarCalificacionesRecibidas(perfil.id, 6)
      .then((rows) => {
        if (cancelled) return;
        setBuyerRatings(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setBuyerRatings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [perfil?.rol, perfil?.id]);

  useEffect(() => {
    if (perfil?.rol !== 'transporter' || !perfil?.id) {
      setFlota([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from('vehiculos')
      .select('*')
      .eq('propietario_id', perfil.id)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logWarn('profile.transporter_vehicles', 'No se pudieron cargar los vehículos del perfil transportista.', {
            perfilId: perfil.id,
            message: error.message,
            code: error.code ?? null,
          });
        }
        if (data) setFlota(data as Vehiculo[]);
        else setFlota([]);
      });
    return () => {
      cancelled = true;
    };
  }, [perfil?.rol, perfil?.id]);

  if (perfil?.rol === 'independent_producer') {
    const goNotificaciones = () => setNotifModalVisible(true);
    const producerAccess = resolveProducerProfileAccess({
      viewerRole: perfil.rol,
      viewerId: perfil.id,
      producerId: perfil.id,
      requestedContext: 'owner',
    });

    return (
      <>
        <ScrollView
          style={s.root}
          contentContainerStyle={[s.scroll, { paddingBottom: scrollBottomPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <ProducerIdentityHeader
            perfil={perfil}
            isVerificado={isVerificado}
            onBell={goNotificaciones}
            onLogout={() => void authService.logout()}
          />
          <SharedProducerProfileBody
            producer={perfil}
            access={producerAccess}
            affiliations={producerAffiliations}
            financedLots={producerFinancedLots}
          />
          <ProfileAccountSection />
          {extraActions}
        </ScrollView>
        <NotificationsCenterModal
          visible={notifModalVisible}
          onClose={() => setNotifModalVisible(false)}
          userId={perfil.id}
        />
      </>
    );
  }

  if (perfil?.rol === 'buyer') {
    const goNotificaciones = () => setNotifModalVisible(true);
    return (
      <>
        <ScrollView
          style={bs.root}
          contentContainerStyle={[bs.scroll, { paddingBottom: scrollBottomPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <BuyerIdentityHeader
            perfil={perfil}
            isVerificado={isVerificado}
            onBell={goNotificaciones}
            onLogout={() => void authService.logout()}
            showNotificationDot={buyerUnreadNotifications}
          />
          <View style={bs.hero}>
            <Text style={bs.roleLine}>Comprador · Mercado y abastecimiento</Text>
            <View style={bs.kycPill}>
              <Text style={bs.kycTxt}>{getAccountStatusLabel(perfil)}</Text>
            </View>
            <Text style={bs.rep}>
              ⭐{' '}
              {typeof perfil.reputacion === 'number' && !Number.isNaN(perfil.reputacion)
                ? perfil.reputacion.toFixed(1)
                : '—'}{' '}
              ({typeof perfil.total_tratos === 'number' ? perfil.total_tratos : 0} ops)
            </Text>
          </View>
          <View style={bs.card}>
            <Text style={bs.cardTitle}>Datos de cuenta</Text>
            <Text style={bs.infoRow}>Teléfono: {perfil.telefono ?? '–'}</Text>
            <Text style={bs.infoRow}>Estado: {perfil.estado_ve}</Text>
            <Text style={bs.infoRow}>Municipio: {perfil.municipio ?? '–'}</Text>
          </View>
          <View style={bs.card}>
            <Text style={bs.cardTitle}>Reputación como comprador</Text>
            <Text style={bs.infoRow}>
              Calificación promedio: ⭐{' '}
              {typeof perfil.reputacion === 'number' && !Number.isNaN(perfil.reputacion)
                ? perfil.reputacion.toFixed(1)
                : '—'}
            </Text>
            <Text style={bs.infoRow}>
              Operaciones valoradas: {typeof perfil.total_tratos === 'number' ? perfil.total_tratos : 0}
            </Text>
            {buyerRatings.length > 0 ? (
              buyerRatings.slice(0, 3).map((item) => (
                <View key={item.id} style={bs.ratingRow}>
                  <Text style={bs.infoRow}>
                    {item.evaluador?.nombre ?? 'Vendedor'} · {item.puntaje}★
                  </Text>
                  {item.comentario ? <Text style={bs.ratingComment}>{item.comentario}</Text> : null}
                </View>
              ))
            ) : (
              <Text style={bs.infoRow}>Todavía no tienes valoraciones registradas.</Text>
            )}
          </View>
          <ProfileAccountSection />
          {extraActions}
        </ScrollView>
      <NotificationsCenterModal
        visible={notifModalVisible}
        onClose={() => {
          setNotifModalVisible(false);
          void Promise.all([contarNotificacionesFreightNoLeidas(perfil.id), contarMensajesMercadoNoLeidos(perfil.id)])
            .then(([fr, chatN]) => setBuyerUnreadNotifications(fr > 0 || chatN > 0))
            .catch(() => setBuyerUnreadNotifications(false));
        }}
        userId={perfil.id}
      />
      </>
    );
  }

  if (perfil?.rol === 'perito') {
    const goNotificaciones = () => setNotifModalVisible(true);
    return (
      <>
        <ScrollView
          style={pt.root}
          contentContainerStyle={[pt.scroll, { paddingTop: Math.max(insets.top, 12), paddingBottom: scrollBottomPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={pt.hero}>
            <View style={pt.heroTop}>
              <View>
                <Text style={pt.brandZ}>ZafraClic</Text>
                <Text style={pt.nombre}>{perfil.nombre}</Text>
                <Text style={pt.rol}>{ROL_LABEL.perito}</Text>
              </View>
              <View style={pt.actionRow}>
                <TouchableOpacity style={pt.iconBtn} onPress={goNotificaciones} accessibilityLabel="Notificaciones">
                  <Ionicons name="notifications-outline" size={18} color={COLORS.roles.perito} />
                </TouchableOpacity>
                <TouchableOpacity style={pt.iconBtn} onPress={() => void authService.logout()} accessibilityLabel="Cerrar sesión">
                  <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={pt.kycBadge}>
              <Text style={pt.kycTxt}>Perfil técnico activo</Text>
            </View>
            <Text style={pt.rep}>Agenda técnica, inspecciones offline y dictámenes con trazabilidad.</Text>
          </View>
          <View style={pt.card}>
            <Text style={pt.cardTitle}>Datos de campo</Text>
            <Text style={pt.infoRow}>Teléfono: {perfil.telefono ?? '–'}</Text>
            <Text style={pt.infoRow}>Estado: {perfil.estado_ve}</Text>
            <Text style={pt.infoRow}>Municipio: {perfil.municipio ?? '–'}</Text>
          </View>
          <View style={pt.card}>
            <Text style={pt.cardTitle}>Qué haces en la app</Text>
            <Text style={pt.infoRow}>Recibes órdenes asignadas por empresa.</Text>
            <Text style={pt.infoRow}>Levantas actas con firma, fotos, GPS y hora.</Text>
            <Text style={pt.infoRow}>Trabajas incluso sin datos y sincronizas cuando vuelve la conexión.</Text>
          </View>
          <ProfileAccountSection />
          {extraActions}
        </ScrollView>
        <NotificationsCenterModal
          visible={notifModalVisible}
          onClose={() => setNotifModalVisible(false)}
          userId={perfil.id}
          peritoId={perfil.id}
        />
      </>
    );
  }

  if (perfil?.rol === 'zafra_ceo') {
    const goNotificaciones = () => setNotifModalVisible(true);
    return (
      <>
        <ScrollView
          style={ceoPs.root}
          contentContainerStyle={[ceoPs.scroll, { paddingTop: Math.max(insets.top, 12), paddingBottom: scrollBottomPad }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={ceoPs.hero}>
            <View style={ceoPs.heroTop}>
              <View>
                <Text style={ceoPs.brandZ}>Zafra CEO</Text>
                <Text style={ceoPs.nombre}>{perfil.nombre}</Text>
                <Text style={ceoPs.rol}>{ROL_LABEL.zafra_ceo}</Text>
              </View>
              <View style={ceoPs.actionRow}>
                <TouchableOpacity style={ceoPs.iconBtn} onPress={goNotificaciones} accessibilityLabel="Notificaciones">
                  <Ionicons name="notifications-outline" size={18} color={CEO_COLORS.cyan} />
                </TouchableOpacity>
                <TouchableOpacity style={ceoPs.iconBtn} onPress={() => void authService.logout()} accessibilityLabel="Cerrar sesión">
                  <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={ceoPs.kycBadge}>
              <Text style={ceoPs.kycTxt}>Cuenta raíz protegida</Text>
            </View>
            <Text style={ceoPs.rep}>Gobierno de usuarios, auditoría, incidentes críticos y trazabilidad ejecutiva.</Text>
          </View>
          <View style={ceoPs.card}>
            <Text style={ceoPs.cardTitle}>Estado ejecutivo</Text>
            <Text style={ceoPs.infoRow}>Teléfono: {perfil.telefono ?? '–'}</Text>
            <Text style={ceoPs.infoRow}>Estado: {perfil.estado_ve}</Text>
            <Text style={ceoPs.infoRow}>Municipio: {perfil.municipio ?? '–'}</Text>
          </View>
          <View style={ceoPs.card}>
            <Text style={ceoPs.cardTitle}>Alcance de la cuenta</Text>
            <Text style={ceoPs.infoRow}>Supervisa gobierno, incidentes y bitácora sensible.</Text>
            <Text style={ceoPs.infoRow}>Consulta reportes ejecutivos y crea cuentas oficiales de perito.</Text>
            <Text style={ceoPs.infoRow}>Accede al modo auditor para casos de alto riesgo con trazabilidad.</Text>
          </View>
          <ProfileAccountSection />
          {extraActions}
        </ScrollView>
        <NotificationsCenterModal
          visible={notifModalVisible}
          onClose={() => setNotifModalVisible(false)}
          userId={perfil.id}
        />
      </>
    );
  }

  if (perfil?.rol === 'agrotienda') {
    return (
      <ScrollView
        style={as.root}
        contentContainerStyle={[as.scroll, { paddingTop: Math.max(insets.top, 12), paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={as.hero}>
          <Text style={as.brandZ}>ZafraClic</Text>
          <View style={as.avatar}>
            {perfil?.avatar_url ? (
              <RemoteImage uri={perfil.avatar_url} style={as.avatarImg} resizeMode="cover" fallbackIcon="person-outline" fallbackIconSize={36} />
            ) : (
              <Text style={as.avatarLetter}>{perfil?.nombre?.[0]?.toUpperCase()}</Text>
            )}
          </View>
          <Text style={as.nombre}>{perfil?.nombre}</Text>
          <Text style={as.rol}>{ROL_LABEL.agrotienda}</Text>
          <View style={as.kycBadge}>
            <Text style={as.kycTxt}>{getAccountStatusLabel(perfil)}</Text>
          </View>
          <Text style={as.rep}>Catálogo privado, negociación por chat y operación nacional.</Text>
        </View>
        <View style={as.card}>
          <Text style={as.cardTitle}>Datos del negocio</Text>
          <Text style={as.infoRow}>Estado: {perfil?.estado_ve}</Text>
          <Text style={as.infoRow}>Municipio: {perfil?.municipio ?? '–'}</Text>
          <Text style={as.infoRow}>Teléfono: {perfil?.telefono ?? '–'}</Text>
        </View>
        <View style={as.card}>
          <Text style={as.cardTitle}>Cómo opera tu panel</Text>
          <Text style={as.infoRow}>Publica insumos o repuestos en un solo inventario.</Text>
          <Text style={as.infoRow}>Las condiciones se acuerdan por chat privado, sin precios públicos.</Text>
          <Text style={as.infoRow}>Puedes responder demandas y coordinar transporte desde la tienda.</Text>
        </View>
        <ProfileAccountSection />
        {extraActions}
        <TouchableOpacity style={as.logout} onPress={() => void authService.logout()}>
          <Text style={as.logoutTxt}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (perfil?.rol === 'transporter') {
    return (
      <ScrollView
        style={ts.root}
        contentContainerStyle={[ts.scroll, { paddingTop: Math.max(insets.top, 12), paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={ts.card}>
          <Text style={ts.brandZ}>ZafraClic</Text>
          <View style={ts.avatar}>
            {perfil?.avatar_url ? (
              <RemoteImage uri={perfil.avatar_url} style={ts.avatarImg} resizeMode="cover" fallbackIcon="person-outline" fallbackIconSize={36} />
            ) : (
              <Text style={ts.avatarLetter}>{perfil?.nombre?.[0]?.toUpperCase()}</Text>
            )}
          </View>
          <Text style={ts.nombre}>{perfil?.nombre}</Text>
          <Text style={ts.rol}>{ROL_LABEL.transporter}</Text>
          <View style={ts.kycBadge}>
            <Text style={ts.kycTxt}>{getAccountStatusLabel(perfil)}</Text>
          </View>
          <Text style={ts.rep}>
            ⭐ {perfil?.reputacion?.toFixed(1) ?? '—'} ({perfil?.total_tratos ?? 0} ops)
          </Text>
        </View>
        <View style={ts.card}>
          <Text style={ts.cardTitle}>Mi flota</Text>
          {flota.length === 0 ? (
            <Text style={ts.infoRow}>
              Aún no hay unidades. Abre la pestaña «Flota» y pulsa «+ Vehículo» para registrarlas.
            </Text>
          ) : (
            flota.map((v) => (
              <View key={v.id} style={ts.vehRow}>
                <Text style={ts.vehPlaca}>{v.placa}</Text>
                <Text style={ts.vehMeta}>
                  {v.tipo}
                  {v.marca || v.modelo ? ` · ${[v.marca, v.modelo].filter(Boolean).join(' ')}` : ''}
                  {v.capacidad_kg != null ? ` · ${(Number(v.capacidad_kg) / 1000).toFixed(1)} t` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
        <View style={ts.infoCard}>
          <Text style={ts.cardTitle}>Datos de contacto</Text>
          <Text style={ts.infoRow}>Teléfono: {perfil?.telefono ?? '–'}</Text>
          <Text style={ts.infoRow}>Estado: {perfil?.estado_ve}</Text>
          <Text style={ts.infoRow}>Municipio: {perfil?.municipio ?? '–'}</Text>
        </View>
        <ProfileAccountSection />
        {extraActions}
        <TouchableOpacity style={ts.logout} onPress={() => void authService.logout()}>
          <Text style={ts.logoutTxt}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, 12), paddingBottom: scrollBottomPad }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.card}>
        <Text style={s.brandZ}>ZafraClic</Text>
        <View style={s.avatar}>
          {perfil?.avatar_url ? (
            <RemoteImage uri={perfil.avatar_url} style={s.avatarImg} resizeMode="cover" fallbackIcon="person-outline" fallbackIconSize={36} />
          ) : (
            <Text style={s.avatarLetter}>{perfil?.nombre?.[0]?.toUpperCase()}</Text>
          )}
        </View>
        <Text style={s.nombre}>{perfil?.nombre}</Text>
        <Text style={s.rol}>{ROL_LABEL[perfil?.rol ?? '']}</Text>
        <View style={s.kycBadge}><Text style={s.kycTxt}>{getAccountStatusLabel(perfil)}</Text></View>
        <Text style={s.rep}>⭐ {perfil?.reputacion?.toFixed(1) ?? '—'} ({perfil?.total_tratos ?? 0} ops)</Text>
      </View>
      <View style={s.infoCard}>
        <Text style={s.infoRow}>Estado: {perfil?.estado_ve}</Text>
        <Text style={s.infoRow}>Municipio: {perfil?.municipio ?? '–'}</Text>
        <Text style={s.infoRow}>Teléfono: {perfil?.telefono ?? '–'}</Text>
      </View>
      <ProfileAccountSection fullBleed />
      {extraActions}
      <TouchableOpacity style={s.logoutBtn} onPress={() => void authService.logout()}><Text style={s.logoutTxt}>Cerrar sesión</Text></TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACE.md, paddingBottom: SPACE.xxl },
  brandZ: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  card: { backgroundColor: COLORS.surface, borderRadius: 12, padding: SPACE.lg, alignItems: 'center', marginBottom: SPACE.md, ...SHADOW.md },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: SPACE.md },
  avatarImg: { width: '100%', height: '100%', borderRadius: 40 },
  avatarLetter: { color: '#FFF', fontSize: 32, fontWeight: FONT.weights.bold },
  nombre: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold },
  rol: { fontSize: FONT.sizes.md, color: COLORS.textSecondary, marginTop: 4 },
  kycBadge: { marginTop: SPACE.sm },
  kycTxt: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold },
  rep: { marginTop: SPACE.sm, color: '#F57C00' },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: SPACE.md, marginBottom: SPACE.md, ...SHADOW.sm },
  infoRow: { fontSize: FONT.sizes.sm, paddingVertical: SPACE.xs },
  logoutBtn: { padding: SPACE.md },
  logoutTxt: { color: COLORS.danger, textAlign: 'center' },
});

const TX_NAVY = '#1E3A8A';
const TX_CREAM = '#FDFBF7';
const AG_PURPLE = '#7C3AED';

const pt = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FBF8' },
  scroll: { paddingBottom: SPACE.xxl },
  hero: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d1fae5',
    ...SHADOW.sm,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  brandZ: { fontSize: 10, fontWeight: '900', color: COLORS.roles.perito, letterSpacing: 3, textTransform: 'uppercase' },
  nombre: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: COLORS.text, marginTop: 8 },
  rol: { fontSize: FONT.sizes.md, color: COLORS.roles.perito, marginTop: 4, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  iconGlyph: { fontSize: 16 },
  kycBadge: {
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  kycTxt: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: COLORS.roles.perito },
  rep: { marginTop: SPACE.sm, color: '#475569', lineHeight: 20, fontWeight: '700' },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d1fae5',
    ...SHADOW.sm,
  },
  cardTitle: { fontSize: 10, fontWeight: '900', color: COLORS.roles.perito, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  infoRow: { fontSize: FONT.sizes.sm, paddingVertical: 8, color: COLORS.text, fontWeight: '600' },
});

const ceoPs = StyleSheet.create({
  root: { flex: 1, backgroundColor: CEO_COLORS.bg },
  scroll: { paddingBottom: SPACE.xxl },
  hero: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: CEO_COLORS.borderStrong,
    ...SHADOW.sm,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  brandZ: { fontSize: 10, fontWeight: '900', color: CEO_COLORS.cyan, letterSpacing: 3, textTransform: 'uppercase' },
  nombre: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, color: CEO_COLORS.text, marginTop: 8 },
  rol: { fontSize: FONT.sizes.md, color: CEO_COLORS.textSoft, marginTop: 4, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CEO_COLORS.panelSoft,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
  },
  iconGlyph: { fontSize: 16 },
  kycBadge: {
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
    backgroundColor: CEO_COLORS.panelSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  kycTxt: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: CEO_COLORS.cyan },
  rep: { marginTop: SPACE.sm, color: CEO_COLORS.textSoft, lineHeight: 20, fontWeight: '700' },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: CEO_COLORS.panel,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: CEO_COLORS.border,
    ...SHADOW.sm,
  },
  cardTitle: { fontSize: 10, fontWeight: '900', color: CEO_COLORS.cyan, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  infoRow: { fontSize: FONT.sizes.sm, paddingVertical: 8, color: CEO_COLORS.text, fontWeight: '600' },
});

const as = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDFBF7' },
  scroll: { paddingBottom: SPACE.xxl },
  brandZ: {
    fontSize: 10,
    fontWeight: '900',
    color: AG_PURPLE,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  hero: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ede9fe',
    ...SHADOW.sm,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: AG_PURPLE,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: SPACE.md,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetter: { color: '#FFF', fontSize: 32, fontWeight: FONT.weights.bold },
  nombre: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, textAlign: 'center', color: COLORS.text },
  rol: { fontSize: FONT.sizes.md, color: '#6d28d9', marginTop: 4, textAlign: 'center', fontWeight: '700' },
  kycBadge: {
    marginTop: SPACE.sm,
    alignSelf: 'center',
    backgroundColor: '#f5f3ff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  kycTxt: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold, color: '#5b21b6' },
  rep: { marginTop: SPACE.sm, color: '#6b7280', textAlign: 'center', fontWeight: '700', lineHeight: 20 },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ede9fe',
    ...SHADOW.sm,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#8b5cf6',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoRow: { fontSize: FONT.sizes.sm, paddingVertical: 8, color: COLORS.text, fontWeight: '600' },
  logout: { padding: SPACE.md },
  logoutTxt: { color: COLORS.danger, textAlign: 'center', fontWeight: '700' },
});

const ts = StyleSheet.create({
  root: { flex: 1, backgroundColor: TX_CREAM },
  scroll: { paddingBottom: SPACE.xxl },
  brandZ: {
    fontSize: 10,
    fontWeight: '900',
    color: TX_NAVY,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: TX_NAVY,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: SPACE.md,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarLetter: { color: '#FFF', fontSize: 32, fontWeight: FONT.weights.bold },
  nombre: { fontSize: FONT.sizes.xl, fontWeight: FONT.weights.bold, textAlign: 'center' },
  rol: { fontSize: FONT.sizes.md, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },
  kycBadge: { marginTop: SPACE.sm, alignSelf: 'center' },
  kycTxt: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.semibold },
  rep: { marginTop: SPACE.sm, color: '#b45309', textAlign: 'center', fontWeight: '700' },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoRow: { fontSize: FONT.sizes.sm, paddingVertical: 8, color: COLORS.text, fontWeight: '600' },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  vehRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  vehPlaca: { fontSize: FONT.sizes.md, fontWeight: '900', color: TX_NAVY, letterSpacing: 1 },
  vehMeta: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  logout: { marginTop: 24, padding: SPACE.md },
  logoutTxt: { color: COLORS.danger, textAlign: 'center', fontWeight: '800', fontSize: FONT.sizes.md },
});

const bs = StyleSheet.create({
  root: { flex: 1, backgroundColor: BUYER_CREAM },
  scroll: { paddingBottom: SPACE.xxl },
  hero: {
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
    color: '#047857',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  roleLine: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  kycPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  kycTxt: { fontSize: FONT.sizes.sm, fontWeight: '700', color: COLORS.text },
  rep: { marginTop: 14, color: '#b45309', fontWeight: '700', fontSize: FONT.sizes.md },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    ...SHADOW.sm,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoRow: { fontSize: FONT.sizes.sm, paddingVertical: 8, color: COLORS.text, fontWeight: '600' },
  ratingRow: { paddingTop: 10, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e7e5e4' },
  ratingComment: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 18, marginTop: 4 },
});
