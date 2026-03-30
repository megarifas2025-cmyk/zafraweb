/**
 * Tabs rol empresa — barra inferior redondeada tipo `diseños/empresa.txt` (Portal B2B).
 */
import React, { lazy, Suspense } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import CompanyStack from './CompanyStack';
import CompanyProfileTabStack from './CompanyProfileTabStack';
import { RouterSpinner } from '@/navigation/RouterChrome';
import { OnboardingModal } from '@/shared/components/OnboardingModal';
import { useAppStore } from '@/store/useAppStore';

const SeguimientoCargaScreen = lazy(() => import('@/shared/screens/SeguimientoCargaScreen'));
const ClimaScreen = lazy(() => import('@/shared/screens/ClimaScreen'));
const ChatScreen = lazy(() => import('@/shared/screens/ChatScreen'));
const NotificacionesUsuarioScreen = lazy(() => import('@/shared/screens/NotificacionesUsuarioScreen'));

function withSuspense<P extends object>(Comp: React.ComponentType<P>) {
  return function Wrapped(props: P) {
    return (
      <Suspense fallback={<RouterSpinner />}>
        <Comp {...props} />
      </Suspense>
    );
  };
}

const Tab = createBottomTabNavigator();

const CREAM_BG = '#FDFBF7';
const SLATE_ACTIVE = '#0f172a';
const SLATE_MUTED = '#94a3b8';

type Ion = keyof typeof Ionicons.glyphMap;

function TabGlyph({ name, focused }: { name: Ion; focused: boolean }) {
  return <Ionicons name={name} size={24} color={focused ? SLATE_ACTIVE : '#cbd5e1'} />;
}

export default function CompanyTabNavigator() {
  const insets = useSafeAreaInsets();
  const { perfil } = useAppStore(useShallow((s) => ({ perfil: s.perfil })));
  const bottomPad = Math.max(insets.bottom, 6);

  return (
    <>
      <OnboardingModal rol="company" userId={perfil?.id} />
      <Tab.Navigator
        sceneContainerStyle={{ flex: 1, backgroundColor: CREAM_BG }}
        screenOptions={{
          headerShown: false,
          lazy: true,
          tabBarActiveTintColor: SLATE_ACTIVE,
          tabBarInactiveTintColor: SLATE_MUTED,
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: [
            styles.tabBar,
            {
              paddingBottom: bottomPad,
              minHeight: 46 + bottomPad,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: -8 },
                  shadowOpacity: 0.07,
                  shadowRadius: 20,
                },
                android: { elevation: 14 },
              }),
            },
          ],
          tabBarItemStyle: { paddingTop: 2 },
        }}
      >
        <Tab.Screen
          name="Empresa"
          component={CompanyStack}
          options={{
            title: 'Panel',
            tabBarIcon: ({ focused }) => (
              <TabGlyph name={focused ? 'layers' : 'layers-outline'} focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Seguimiento"
          component={withSuspense(SeguimientoCargaScreen)}
          options={{
            title: 'Carga',
            tabBarIcon: ({ focused }) => <TabGlyph name={focused ? 'cube' : 'cube-outline'} focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Chat"
          component={withSuspense(ChatScreen)}
          options={{
            title: 'Chats',
            tabBarIcon: ({ focused }) => <TabGlyph name={focused ? 'chatbubbles' : 'chatbubbles-outline'} focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Notificaciones"
          component={withSuspense(NotificacionesUsuarioScreen)}
          options={{ tabBarButton: () => null, headerShown: false }}
        />
        <Tab.Screen name="Clima" component={withSuspense(ClimaScreen)} options={{ tabBarButton: () => null, headerShown: false }} />
        <Tab.Screen
          name="PerfilEmpresa"
          component={CompanyProfileTabStack}
          options={{
            title: 'Perfil',
            tabBarIcon: ({ focused }) => <TabGlyph name={focused ? 'person' : 'person-outline'} focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 1,
  },
});
