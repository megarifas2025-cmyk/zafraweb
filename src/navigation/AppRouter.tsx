import React, { useCallback } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { useAuth } from '@/shared/store/AuthContext';
import { trackScreenView } from '@/shared/runtime/uiEventTracker';
import { authService } from '@/shared/services/authService';
import { COLORS } from '@/shared/utils/theme';
import { NAV_THEME, RouterFallbackScreen, RouterSpinner } from '@/navigation/RouterChrome';
import { RoleShellResolver } from '@/navigation/RoleShellResolver';
import { OfflineBar } from '@/shared/components/OfflineBar';
import WelcomeScreen from '@/features/auth/screens/WelcomeScreen';
import LoginScreen from '@/features/auth/screens/LoginScreen';
import RegisterScreen from '@/features/auth/screens/RegisterScreen';
import ResetPasswordScreen from '@/features/auth/screens/ResetPasswordScreen';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

export function AppRouter() {
  const { session, perfil, loading, passwordRecoveryActive, bootMessage } = useAuth();

  const esperandoPerfil = !!session && !perfil && !bootMessage;
  const perfilInvalido = !!session && !perfil && !!bootMessage;
  const accesoBloqueado = !!perfil && !!perfil.bloqueado;

  const initialRoute = !session
    ? 'Welcome'
    : esperandoPerfil
      ? 'BootWait'
      : perfilInvalido
        ? 'ProfileMissing'
        : accesoBloqueado
          ? 'Blocked'
          : 'App';

  const stackKey = !session
    ? 'guest'
    : esperandoPerfil
      ? 'boot'
      : perfilInvalido
        ? 'missing-profile'
        : accesoBloqueado
          ? 'blocked'
          : `app-${perfil?.id ?? 'unknown'}`;

  const handleNavigationTracking = useCallback(() => {
    const route = navigationRef.getCurrentRoute();
    const routeName = typeof route?.name === 'string' ? route.name : null;
    if (!routeName) return;
    trackScreenView(routeName, {
      role: perfil?.rol ?? null,
      stackKey,
    });
  }, [perfil?.rol, stackKey]);

  if (loading) return <RouterSpinner />;

  if (passwordRecoveryActive && session) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <NavigationContainer ref={navigationRef} theme={NAV_THEME} onReady={handleNavigationTracking} onStateChange={handleNavigationTracking}>
          <Stack.Navigator
            screenOptions={{
              headerShown: true,
              headerStyle: { backgroundColor: COLORS.primary },
              headerTintColor: '#FFF',
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: COLORS.background },
            }}
          >
            <Stack.Screen
              name="ResetPassword"
              component={ResetPasswordScreen}
              options={{ title: 'Nueva contraseña' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <OfflineBar />
      <NavigationContainer ref={navigationRef} theme={NAV_THEME} onReady={handleNavigationTracking} onStateChange={handleNavigationTracking}>
        <Stack.Navigator
          key={stackKey}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.background },
          }}
          initialRouteName={initialRoute}
        >
          {!session ? (
            <>
              <Stack.Screen name="Welcome" component={WelcomeScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          ) : esperandoPerfil ? (
            <Stack.Screen name="BootWait" options={{ animation: 'none' }}>
              {() => (
                <RouterSpinner
                  title="Cargando tu espacio de trabajo…"
                  subtitle="Estamos validando tu sesión y preparando tu perfil operativo."
                />
              )}
            </Stack.Screen>
          ) : perfilInvalido ? (
            <Stack.Screen name="ProfileMissing" options={{ animation: 'none' }}>
              {() => (
                <RouterFallbackScreen
                  title="Perfil operativo no disponible"
                  message={bootMessage}
                  actionLabel="Cerrar sesión"
                  onAction={() => void authService.logout()}
                />
              )}
            </Stack.Screen>
          ) : accesoBloqueado ? (
            <Stack.Screen name="Blocked" options={{ animation: 'none' }}>
              {() => (
                <RouterFallbackScreen
                  title="Cuenta bloqueada"
                  message="Tu acceso fue suspendido temporalmente por el equipo administrativo. Contacta soporte o la administración para revisar el caso."
                  actionLabel="Cerrar sesión"
                  onAction={() => void authService.logout()}
                />
              )}
            </Stack.Screen>
          ) : perfil ? (
            <Stack.Screen name="App">
              {() => <RoleShellResolver currentRole={perfil.rol} />}
            </Stack.Screen>
          ) : null}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}
