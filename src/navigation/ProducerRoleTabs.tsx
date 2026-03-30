/**
 * Tabs solo rol `independent_producer` — barra Unicornio con FAB Scan (`diseños/agricultor.txt`).
 */
import React, { lazy, Suspense, type ComponentType } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '@/shared/utils/theme';
import ProducerStack from '@/features/producer/navigation/ProducerStack';
import { ProducerUnicornioTabBar } from './ProducerUnicornioTabBar';
import { OnboardingModal } from '@/shared/components/OnboardingModal';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';

const ChatScreen = lazy(() => import('@/shared/screens/ChatScreen'));
const PerfilScreen = lazy(() => import('@/shared/screens/PerfilScreen'));
const SeguimientoCargaScreen = lazy(() => import('@/shared/screens/SeguimientoCargaScreen'));
const ClimaScreen = lazy(() => import('@/shared/screens/ClimaScreen'));
const NotificacionesUsuarioScreen = lazy(() => import('@/shared/screens/NotificacionesUsuarioScreen'));

const Tab = createBottomTabNavigator();

function Spinner() {
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={s.hint}>Cargando…</Text>
    </View>
  );
}

function withSuspense<P extends object>(Comp: ComponentType<P>) {
  return function TabScene(props: P) {
    return (
      <Suspense fallback={<Spinner />}>
        <Comp {...props} />
      </Suspense>
    );
  };
}

export default function ProducerRoleTabs() {
  const { perfil } = useAppStore(useShallow((s) => ({ perfil: s.perfil })));
  return (
    <>
      <OnboardingModal rol="independent_producer" userId={perfil?.id} />
      <Tab.Navigator
      sceneContainerStyle={{ flex: 1, backgroundColor: '#FDFBF7' }}
      tabBar={props => <ProducerUnicornioTabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen name="Dashboard" component={ProducerStack} options={{ title: 'Mi Finca' }} />
      <Tab.Screen name="Seguimiento" component={withSuspense(SeguimientoCargaScreen)} options={{ title: 'Carga' }} />
      <Tab.Screen name="Chat" component={withSuspense(ChatScreen)} options={{ title: 'Chats' }} />
      <Tab.Screen name="Perfil" component={withSuspense(PerfilScreen)} options={{ title: 'Perfil' }} />
      <Tab.Screen
        name="Notificaciones"
        component={withSuspense(NotificacionesUsuarioScreen)}
        options={{ tabBarButton: () => null, headerShown: false }}
      />
      <Tab.Screen name="Clima" component={withSuspense(ClimaScreen)} options={{ tabBarButton: () => null, headerShown: false }} />
    </Tab.Navigator>
    </>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  hint: { marginTop: 8, color: COLORS.textSecondary, fontSize: 13 },
});
