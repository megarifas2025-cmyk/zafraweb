import 'react-native-reanimated';
import '@/bootstrap/fontScale';
import '@/shared/services/backgroundFreightTrackingTask';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/shared/store/AuthContext';
import { flushUiEventQueue } from '@/shared/runtime/uiEventTracker';
import { ChatUnreadProvider } from '@/shared/store/ChatUnreadContext';
import { PushRegistrationBootstrap } from '@/shared/components/PushRegistrationBootstrap';
import { AppRouter } from '@/navigation/AppRouter';
import { AppErrorBoundary } from '@/shared/runtime/AppErrorBoundary';
import { attachGlobalFieldInspectionNetInfo } from '@/shared/services/fieldInspectionSync';

function PushBootstrapGate() {
  const { session } = useAuth();
  return <PushRegistrationBootstrap userId={session?.user?.id ?? null} />;
}

function GlobalPeritoFieldSync() {
  const { session, perfil } = useAuth();

  useEffect(() => {
    if (perfil?.rol !== 'perito' || !session?.user?.id) return;
    const uid = session.user.id;
    /** NetInfo emite el estado actual al suscribirse → sync al abrir con red. */
    return attachGlobalFieldInspectionNetInfo(uid);
  }, [perfil?.rol, session?.user?.id]);

  return null;
}

function UiTrackingBootstrap() {
  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void flushUiEventQueue();
      }
    });
    return () => appStateSub.remove();
  }, []);

  return null;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <SafeAreaProvider style={{ flex: 1 }}>
        <StatusBar style="light" backgroundColor="#1B4332" />
        <AuthProvider>
          <PushBootstrapGate />
          <ChatUnreadProvider>
            <UiTrackingBootstrap />
            <GlobalPeritoFieldSync />
            <AppRouter />
          </ChatUnreadProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
