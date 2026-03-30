import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { persistExpoPushToken, registerForPushNotificationsAsync } from '@/shared/services/pushNotifications';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

type Props = {
  userId: string | null;
};

/** True cuando la app corre dentro de Expo Go (no en build de desarrollo/producción). */
function isExpoGo(): boolean {
  return (Constants.appOwnership as string | undefined) === 'expo';
}

/**
 * Maneja la respuesta a una notificación push (tap del usuario).
 * Navega a la pantalla correspondiente según `data.tipo`.
 *
 * Tipos soportados:
 *   - `chat`       → abre ChatScreen
 *   - `freight`    → abre SeguimientoCargaScreen (o la pizarra de fletes)
 *   - `insumo_chat` → abre el dashboard con tab "Chats" (agrotienda)
 */
function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  nav: NavigationProp<ParamListBase>,
) {
  try {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    if (!data) return;
    const tipo = data.tipo as string | undefined;
    if (tipo === 'chat' || tipo === 'cosecha_chat') {
      nav.navigate('Chat');
    } else if (tipo === 'freight' || tipo === 'flete') {
      nav.navigate('Seguimiento');
    } else if (tipo === 'insumo_chat') {
      nav.navigate('Dashboard');
    } else {
      // Por defecto, ir al Chat que es el punto de encuentro
      nav.navigate('Chat');
    }
  } catch {
    /* Silencioso si la navegación no está lista */
  }
}

/**
 * Registra token Expo en `perfiles.expo_push_token` para que la Edge Function envíe push fuera de la app.
 * En Expo Go (SDK 53+) los push remotos no están disponibles — se omite sin error.
 * También maneja el tap en notificaciones para navegar a la pantalla correcta.
 */
export function PushRegistrationBootstrap({ userId }: Props) {
  const lastSavedRef = useRef<string | null>(null);
  let nav: NavigationProp<ParamListBase> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    nav = useNavigation<NavigationProp<ParamListBase>>();
  } catch {
    /* useNavigation puede fallar si el componente está fuera del NavigationContainer */
  }

  useEffect(() => {
    if (!userId) {
      lastSavedRef.current = null;
      return;
    }

    // Push remotos no disponibles en Expo Go SDK 53+; solo funciona en builds.
    if (isExpoGo()) return;

    const uid = userId;
    let cancelled = false;

    async function syncToken(): Promise<void> {
      try {
        const token = await registerForPushNotificationsAsync();
        if (cancelled || !token) return;
        if (lastSavedRef.current === token) return;
        lastSavedRef.current = token;
        await persistExpoPushToken(uid, token);
      } catch {
        /* Silencioso: el dispositivo/emulador no soporta push */
      }
    }

    void syncToken();

    let subToken: ReturnType<typeof Notifications.addPushTokenListener> | null = null;
    try {
      subToken = Notifications.addPushTokenListener(() => {
        void (async () => {
          try {
            const token = await registerForPushNotificationsAsync();
            if (cancelled || !token) return;
            lastSavedRef.current = token;
            await persistExpoPushToken(uid, token);
          } catch {
            /* Silencioso */
          }
        })();
      });
    } catch {
      /* addPushTokenListener no disponible en este entorno */
    }

    const subApp = AppState.addEventListener('change', state => {
      if (state === 'active') void syncToken();
    });

    // Manejar tap en notificación cuando la app está en segundo plano o cerrada
    let subResponse: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | null = null;
    if (nav) {
      const navRef = nav;
      subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationResponse(response, navRef);
      });
      // Verificar si la app fue abierta desde una notificación
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response && !cancelled) handleNotificationResponse(response, navRef);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
      subToken?.remove();
      subApp.remove();
      subResponse?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return null;
}
