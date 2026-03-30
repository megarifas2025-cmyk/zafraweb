import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RolUsuario } from '@/shared/types';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const ONBOARDING_KEY_PREFIX = 'zafraclic_onboarding_v1_';

type Step = { icon: string; color: string; title: string; desc: string };

const ROLE_ONBOARDING: Record<RolUsuario, { title: string; subtitle: string; accent: string; steps: Step[] }> = {
  independent_producer: {
    title: 'Bienvenido, Agricultor',
    subtitle: 'Aquí vendés tus cosechas y gestionás tus operaciones de campo',
    accent: COLORS.roles.independent_producer,
    steps: [
      { icon: '🌿', color: '#065f46', title: 'Publica tu cosecha', desc: 'Ve a "Publicar cosecha" y completa rubro, cantidad, municipio y fecha disponible. Los compradores te encontrarán automáticamente.' },
      { icon: '💬', color: '#1d4ed8', title: 'Negocia por chat', desc: 'Los compradores te contactarán por chat antes de cerrar el trato. Tú decides a quién venderle marcando "Cerrar trato".' },
      { icon: '🚚', color: '#92400e', title: 'Solicita transporte', desc: 'Usa el botón 🚚 del panel para publicar una solicitud de flete. Los transportistas disponibles te contactarán.' },
      { icon: '📊', color: '#4c1d95', title: 'Mis ventas', desc: 'En el menú de herramientas toca "Mis ventas" para ver el historial de cosechas que cerraste exitosamente.' },
    ],
  },
  buyer: {
    title: 'Bienvenido, Comprador',
    subtitle: 'Explora el mercado agrícola y conecta con productores locales',
    accent: COLORS.roles.buyer,
    steps: [
      { icon: '🛒', color: '#1d4ed8', title: 'Explora el mercado', desc: 'En la pestaña "Mercado" verás cosechas disponibles por rubro. Filtra por estado/municipio para encontrar lo más cercano.' },
      { icon: '💬', color: '#065f46', title: 'Consulta antes de comprar', desc: 'Toca una cosecha → "Contactar vendedor". Puedes chatear con el productor para negociar precio y condiciones.' },
      { icon: '🏪', color: '#7B1FA2', title: 'Insumos y repuestos', desc: 'Cambia al tab "Insumos" para ver el catálogo de agrotiendas. Toca "Consultar / Chatear" para negociar directamente.' },
      { icon: '❤️', color: '#e11d48', title: 'Guarda favoritos', desc: 'Toca el ♡ en cualquier insumo para guardarlo. Accede rápido desde el tab "Favoritos".' },
    ],
  },
  agrotienda: {
    title: 'Bienvenido, Agrotienda',
    subtitle: 'Tu catálogo digital de insumos y repuestos agrícolas',
    accent: COLORS.roles.agrotienda,
    steps: [
      { icon: '📦', color: '#7B1FA2', title: 'Agrega productos', desc: 'Toca "+ Añadir" en el inventario para publicar insumos o repuestos. Incluye descripción, stock y categoría.' },
      { icon: '💬', color: '#1d4ed8', title: 'Bandeja de chats', desc: 'Ve al tab "Chats" para ver las consultas que hacen los compradores sobre tus productos. Responde y negocia.' },
      { icon: '✅', color: '#065f46', title: 'Confirma ventas', desc: 'Cuando llegues a un acuerdo, toca "Confirmar venta" dentro del chat. El stock se descuenta automáticamente.' },
      { icon: '📈', color: '#92400e', title: 'Historial', desc: 'En la pestaña "Chats" → sub-tab "Vendidos" verás todas tus ventas confirmadas con fecha y nombre del comprador.' },
    ],
  },
  transporter: {
    title: 'Bienvenido, Transportista',
    subtitle: 'Encuentra carga y gestiona tus viajes desde un solo lugar',
    accent: COLORS.roles.transporter,
    steps: [
      { icon: '📋', color: '#1d4ed8', title: 'Pizarra de fletes', desc: 'En "Flota" verás las solicitudes de transporte activas. Toca "💬 Contactar y negociar" para iniciar una conversación.' },
      { icon: '🤝', color: '#065f46', title: 'Negocia sin compromiso', desc: 'Puedes chatear con varios solicitantes antes de que se cierre un trato. El solicitante elige con quién trabajar.' },
      { icon: '🗺️', color: '#92400e', title: 'Gestiona tus rutas', desc: 'En la pestaña "Rutas" verás el seguimiento de tus viajes activos. Reporta salida y llegada para generar confianza.' },
      { icon: '⭐', color: '#b45309', title: 'Construye reputación', desc: 'Cada viaje completado puede recibir calificación del solicitante. Mantén buenas evaluaciones para destacar.' },
    ],
  },
  company: {
    title: 'Bienvenido, Empresa',
    subtitle: 'Panel de gestión completo para tu operación agroindustrial',
    accent: COLORS.roles.company,
    steps: [
      { icon: '🌾', color: '#065f46', title: 'Gestiona agricultores', desc: 'Afilia productores a tu empresa, supervisa sus fincas y cosechas activas desde el panel principal.' },
      { icon: '📋', color: '#1d4ed8', title: 'Inspecciones de campo', desc: 'Asigna peritos para inspeccionar lotes. Los reportes se consolidan automáticamente en tus analíticas.' },
      { icon: '🚛', color: '#92400e', title: 'Flota propia', desc: 'Desde el panel abre "Flota propia" para registrar unidades y coordinar choferes en solicitudes internas.' },
      { icon: '📊', color: '#4c1d95', title: 'Reportes y estadísticas', desc: 'Desde el panel abre "Reportes y estadísticas" para revisar indicadores operativos y exportables.' },
    ],
  },
  perito: {
    title: 'Bienvenido, Perito',
    subtitle: 'Inspecciona y certifica cultivos desde tu dispositivo',
    accent: COLORS.roles.perito,
    steps: [
      { icon: '📋', color: '#1d4ed8', title: 'Tus inspecciones', desc: 'En el panel verás las inspecciones asignadas. Toca una para ver el detalle del lote y el productor.' },
      { icon: '📝', color: '#065f46', title: 'Levanta el acta', desc: 'Usa "Levantar acta" para registrar estado del cultivo, fotos y observaciones. Funciona sin internet.' },
      { icon: '✍️', color: '#92400e', title: 'Firma digital', desc: 'Al finalizar, firma en pantalla para certificar el informe. Se sincronizará cuando recuperes conexión.' },
      { icon: '📄', color: '#4c1d95', title: 'Consulta historial', desc: 'Usa "Ver historial" para revisar el detalle de la orden, el dictamen resumido y el avance de sincronización.' },
    ],
  },
  zafra_ceo: {
    title: 'Panel Administrativo',
    subtitle: 'Supervisión completa de la plataforma ZafraClic',
    accent: COLORS.roles.zafra_ceo,
    steps: [
      { icon: '🛡️', color: '#4c1d95', title: 'Métricas globales', desc: 'El dashboard muestra usuarios activos, fletes en curso, inspecciones pendientes y alertas en tiempo real.' },
      { icon: '⚡', color: '#1d4ed8', title: 'Supervisión de fletes', desc: 'La pestaña "Supervisión" muestra todos los fletes activos con seguimiento GPS en vivo.' },
      { icon: '⚖️', color: '#92400e', title: 'Gobernanza y auditoría', desc: 'Revisa incidentes de chat, rastro de auditoría y reportes del sistema desde el menú de herramientas.' },
      { icon: '👤', color: '#065f46', title: 'Crear cuenta perito', desc: 'Desde "Crear cuenta perito" puedes registrar nuevos auditores de campo asignándoles empresa y credenciales.' },
    ],
  },
};

interface Props {
  rol: RolUsuario | null | undefined;
  /** ID del usuario para distinguir onboardings por cuenta */
  userId: string | null | undefined;
}

export function OnboardingModal({ rol, userId }: Props) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!rol || !userId) return;
    const key = `${ONBOARDING_KEY_PREFIX}${rol}_${userId}`;
    AsyncStorage.getItem(key)
      .then((val) => {
        if (!val) setVisible(true);
      })
      .catch(() => undefined);
  }, [rol, userId]);

  const cerrar = useCallback(async () => {
    if (!rol || !userId) return;
    const key = `${ONBOARDING_KEY_PREFIX}${rol}_${userId}`;
    await AsyncStorage.setItem(key, '1').catch(() => undefined);
    setVisible(false);
    setStep(0);
  }, [rol, userId]);

  if (!visible || !rol || !ROLE_ONBOARDING[rol]) return null;

  const config = ROLE_ONBOARDING[rol];
  const total = config.steps.length;
  const current = config.steps[step];
  const isLast = step === total - 1;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => void cerrar()}>
      <View style={s.overlay}>
        <View style={[s.card, { paddingBottom: Math.max(insets.bottom + SPACE.md, SPACE.xl) }]}>
          {/* Header */}
          <View style={[s.headerStrip, { backgroundColor: config.accent, paddingTop: Math.max(insets.top, SPACE.md) }]}>
            <Text style={s.headerTitle}>{config.title}</Text>
            <Text style={s.headerSub} numberOfLines={2}>{config.subtitle}</Text>
          </View>

          {/* Step content */}
          <View style={s.body}>
            <Text style={s.stepEmoji}>{current.icon}</Text>
            <Text style={[s.stepTitle, { color: current.color }]}>{current.title}</Text>
            <Text style={s.stepDesc}>{current.desc}</Text>
          </View>

          {/* Dots */}
          <View style={s.dots}>
            {config.steps.map((_, i) => (
              <View
                key={i}
                style={[s.dot, i === step && { backgroundColor: config.accent, width: 20 }]}
              />
            ))}
          </View>

          {/* Buttons */}
          <View style={s.btnRow}>
            <TouchableOpacity style={s.skipBtn} onPress={() => void cerrar()}>
              <Text style={s.skipTxt}>Saltar</Text>
            </TouchableOpacity>

            {!isLast ? (
              <TouchableOpacity
                style={[s.nextBtn, { backgroundColor: config.accent }]}
                onPress={() => setStep((s2) => s2 + 1)}
                activeOpacity={0.88}
              >
                <Text style={s.nextTxt}>Siguiente</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.nextBtn, { backgroundColor: config.accent }]}
                onPress={() => void cerrar()}
                activeOpacity={0.88}
              >
                <Ionicons name="checkmark" size={18} color="#FFF" />
                <Text style={s.nextTxt}>¡Comenzar!</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  card: {
    backgroundColor: '#FDFBF7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    ...SHADOW.lg,
  },
  headerStrip: {
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.lg,
  },
  headerTitle: {
    fontSize: FONT.sizes.xxl,
    fontWeight: FONT.weights.bold,
    color: '#FFF',
  },
  headerSub: {
    fontSize: FONT.sizes.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    lineHeight: 20,
  },
  body: {
    padding: SPACE.xl,
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
  },
  stepEmoji: {
    fontSize: 52,
    marginBottom: SPACE.md,
    textAlign: 'center',
  },
  stepTitle: {
    fontSize: FONT.sizes.xl,
    fontWeight: FONT.weights.bold,
    textAlign: 'center',
    marginBottom: SPACE.sm,
  },
  stepDesc: {
    fontSize: FONT.sizes.md,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: SPACE.sm,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: SPACE.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    gap: SPACE.md,
  },
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: SPACE.md,
  },
  skipTxt: {
    color: '#94a3b8',
    fontSize: FONT.sizes.sm,
    fontWeight: FONT.weights.semibold,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    ...SHADOW.sm,
  },
  nextTxt: {
    color: '#FFF',
    fontWeight: FONT.weights.bold,
    fontSize: FONT.sizes.md,
  },
});
