import React, { lazy, Suspense, type ComponentType } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/shared/utils/theme';
import { RequireRole } from '@/navigation/guards/RequireRole';
import { RouterFallbackScreen, RouterSpinner } from '@/navigation/RouterChrome';
import { TransporterTabBar } from '@/features/transporter/navigation/TransporterTabBar';
import { OnboardingModal } from '@/shared/components/OnboardingModal';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import ProducerRoleTabs from '@/navigation/ProducerRoleTabs';
import PeritoStack from '@/features/perito/navigation/PeritoStack';
import type { RolUsuario } from '@/shared/types';

const SuperAdminStack = lazy(() => import('@/features/super-admin/navigation/SuperAdminStack'));
const CompanyTabNavigator = lazy(() => import('@/features/company/navigation/CompanyTabNavigator'));
const BuyerStack = lazy(() => import('@/features/buyer/navigation/BuyerStack'));
const TransporterDashboard = lazy(() => import('@/features/transporter/screens/TransporterDashboard'));
const TransporterRutasScreen = lazy(() => import('@/features/transporter/screens/TransporterRutasScreen'));
const AgrotiendaDashboard = lazy(() => import('@/features/agrotienda/screens/AgrotiendaDashboard'));

const ChatScreen = lazy(() => import('@/shared/screens/ChatScreen'));
const PerfilScreen = lazy(() => import('@/shared/screens/PerfilScreen'));
const SeguimientoCargaScreen = lazy(() => import('@/shared/screens/SeguimientoCargaScreen'));
const CeoOperationalSupervisionScreen = lazy(() => import('@/features/super-admin/screens/CeoOperationalSupervisionScreen'));
const ClimaScreen = lazy(() => import('@/shared/screens/ClimaScreen'));
const NotificacionesUsuarioScreen = lazy(() => import('@/shared/screens/NotificacionesUsuarioScreen'));

const Tab = createBottomTabNavigator();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={styles.tabHit}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
    </View>
  );
}

function withSuspense<P extends object>(Comp: ComponentType<P>) {
  return function TabScene(props: P) {
    return (
      <Suspense fallback={<RouterSpinner />}>
        <Comp {...props} />
      </Suspense>
    );
  };
}

function tabOpts(accent: string, bottomInset: number) {
  return {
    headerShown: false,
    tabBarActiveTintColor: accent,
    tabBarInactiveTintColor: '#9E9E9E',
    tabBarStyle: {
      backgroundColor: '#FFF',
      borderTopColor: '#E0E0E0',
      paddingTop: 2,
      paddingBottom: bottomInset,
      minHeight: 44 + bottomInset,
    },
    tabBarLabelStyle: { fontSize: 11, marginTop: 1 },
    lazy: true as const,
    tabBarHideOnKeyboard: true,
  };
}

const ROLE_TABS: Record<
  Exclude<RolUsuario, 'company' | 'independent_producer'>,
  { tabs: { name: string; title: string; emoji: string; screen: ComponentType<object> }[]; color: string }
> = {
  zafra_ceo: {
    color: COLORS.roles.zafra_ceo,
    tabs: [
      { name: 'Dashboard',     title: 'CEO',           emoji: '🛡️', screen: withSuspense(SuperAdminStack) },
      { name: 'Supervision',   title: 'Supervisión',   emoji: '⚡',  screen: withSuspense(CeoOperationalSupervisionScreen) },
      { name: 'Chat',          title: 'Chats',         emoji: '💬',  screen: withSuspense(ChatScreen) },
      { name: 'Perfil',        title: 'Perfil',        emoji: '👤',  screen: withSuspense(PerfilScreen) },
    ],
  },
  perito: {
    color: COLORS.roles.perito,
    tabs: [
      { name: 'Dashboard', title: 'Inspecciones', emoji: '📋', screen: withSuspense(PeritoStack) },
      { name: 'Chat', title: 'Chats', emoji: '💬', screen: withSuspense(ChatScreen) },
      { name: 'Perfil', title: 'Perfil', emoji: '👤', screen: withSuspense(PerfilScreen) },
    ],
  },
  buyer: {
    color: COLORS.roles.buyer,
    tabs: [
      { name: 'Dashboard', title: 'Mercado', emoji: '🛒', screen: withSuspense(BuyerStack) },
      { name: 'Seguimiento', title: 'Carga', emoji: '📦', screen: withSuspense(SeguimientoCargaScreen) },
      { name: 'Chat', title: 'Chats', emoji: '💬', screen: withSuspense(ChatScreen) },
      { name: 'Perfil', title: 'Perfil', emoji: '👤', screen: withSuspense(PerfilScreen) },
    ],
  },
  transporter: {
    color: COLORS.roles.transporter,
    tabs: [
      { name: 'Flota', title: 'Flota', emoji: '🚛', screen: withSuspense(TransporterDashboard) },
      { name: 'Rutas', title: 'Rutas', emoji: '🗺️', screen: withSuspense(TransporterRutasScreen) },
      { name: 'Chat', title: 'Chats', emoji: '💬', screen: withSuspense(ChatScreen) },
      { name: 'Perfil', title: 'Perfil', emoji: '👤', screen: withSuspense(PerfilScreen) },
    ],
  },
  agrotienda: {
    color: COLORS.roles.agrotienda,
    tabs: [
      { name: 'Dashboard', title: 'Mi tienda', emoji: '🏪', screen: withSuspense(AgrotiendaDashboard) },
      { name: 'Seguimiento', title: 'Carga', emoji: '📦', screen: withSuspense(SeguimientoCargaScreen) },
      { name: 'Chat', title: 'Chats', emoji: '💬', screen: withSuspense(ChatScreen) },
      { name: 'Perfil', title: 'Perfil', emoji: '👤', screen: withSuspense(PerfilScreen) },
    ],
  },
};

function SharedRoleTabs({ rol }: { rol: Exclude<RolUsuario, 'company' | 'independent_producer'> }) {
  const insets = useSafeAreaInsets();
  const { perfil } = useAppStore(useShallow((s) => ({ perfil: s.perfil })));
  const config = ROLE_TABS[rol];
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 6 : 8);

  if (!config) {
    return (
      <RouterFallbackScreen
        title="No se pudo cargar el panel"
        message={`Rol no reconocido (${String(rol)}). Cierra sesión en Perfil o contacta soporte.`}
      />
    );
  }

  return (
    <>
      <OnboardingModal rol={rol} userId={perfil?.id} />
      <Tab.Navigator
        screenOptions={tabOpts(config.color, bottomInset)}
        tabBar={rol === 'transporter' ? (props) => <TransporterTabBar {...props} /> : undefined}
      >
      {config.tabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.screen}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused }) => <TabIcon emoji={tab.emoji} focused={focused} />,
          }}
        />
      ))}
      <Tab.Screen
        name="Notificaciones"
        component={withSuspense(NotificacionesUsuarioScreen)}
        options={{ tabBarButton: () => null, headerShown: false }}
      />
      <Tab.Screen
        name="Clima"
        component={withSuspense(ClimaScreen)}
        options={{ tabBarButton: () => null, headerShown: false }}
      />
      </Tab.Navigator>
    </>
  );
}

type RoleShellResolverProps = {
  currentRole: RolUsuario | null | undefined;
};

export function RoleShellResolver({ currentRole }: RoleShellResolverProps) {
  if (!currentRole) {
    return (
      <RouterFallbackScreen
        title="Rol no disponible"
        message="No se pudo determinar el rol operativo del usuario."
      />
    );
  }

  switch (currentRole) {
    case 'company':
      return (
        <RequireRole
          currentRole={currentRole}
          allowedRoles={['company']}
          fallback={<RouterFallbackScreen title="Acceso denegado" message="Este panel es exclusivo del rol Empresa." />}
        >
          <Suspense fallback={<RouterSpinner />}>
            <CompanyTabNavigator />
          </Suspense>
        </RequireRole>
      );

    case 'independent_producer':
      return (
        <RequireRole
          currentRole={currentRole}
          allowedRoles={['independent_producer']}
          fallback={<RouterFallbackScreen title="Acceso denegado" message="Este panel es exclusivo del rol Agricultor." />}
        >
          <ProducerRoleTabs />
        </RequireRole>
      );

    case 'zafra_ceo':
    case 'perito':
    case 'buyer':
    case 'transporter':
    case 'agrotienda':
      return (
        <RequireRole
          currentRole={currentRole}
          allowedRoles={[currentRole]}
          fallback={<RouterFallbackScreen title="Acceso denegado" message="No tienes permisos para abrir este shell." />}
        >
          <SharedRoleTabs rol={currentRole} />
        </RequireRole>
      );

    default:
      return (
        <RouterFallbackScreen
          title="No se pudo cargar el panel"
          message={`Rol no reconocido (${String(currentRole)}). Cierra sesión en Perfil o contacta soporte.`}
        />
      );
  }
}

const styles = StyleSheet.create({
  tabHit: {
    minWidth: 44,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
