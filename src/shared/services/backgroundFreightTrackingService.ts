import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FREIGHT_BACKGROUND_CONTEXT_KEY,
  FREIGHT_BACKGROUND_TASK,
} from '@/shared/services/backgroundFreightTrackingTask';
import { logError, logInfo, logWarn, serializeError } from '@/shared/runtime/appLogger';
import type { RolUsuario } from '@/shared/types';
import { useAppStore } from '@/store/useAppStore';

type BackgroundTrackingContext = {
  freightRequestId: string;
  actorId: string;
  actorRole: RolUsuario;
  label?: string | null;
};

export async function requestBackgroundTrackingPermission(): Promise<boolean> {
  const { roleLabel } = useAppStore.getState();
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    logWarn('freight.bg.permission', 'Permiso foreground denegado para tracking.', {
      roleLabel,
      status: foreground.status,
    });
    return false;
  }
  if (roleLabel !== 'Transporte') {
    logInfo('freight.bg.permission', 'Tracking background omitido por rol no transporte.', {
      roleLabel,
    });
    return true;
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    logWarn('freight.bg.permission', 'Permiso background denegado para tracking.', {
      roleLabel,
      status: background.status,
    });
  }
  return background.status === 'granted';
}

export async function startFreightBackgroundTracking(context: BackgroundTrackingContext): Promise<void> {
  const { roleLabel } = useAppStore.getState();
  if (roleLabel !== 'Transporte') {
    logWarn('freight.bg.start', 'Intento de iniciar tracking background con rol no permitido.', {
      roleLabel,
      actorId: context.actorId,
      actorRole: context.actorRole,
      freightRequestId: context.freightRequestId,
    });
    throw new Error('El tracking en segundo plano solo está permitido para el rol Transporte.');
  }

  try {
    await AsyncStorage.setItem(FREIGHT_BACKGROUND_CONTEXT_KEY, JSON.stringify(context));

    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(FREIGHT_BACKGROUND_TASK);
    if (alreadyStarted) {
      await Location.stopLocationUpdatesAsync(FREIGHT_BACKGROUND_TASK);
    }

    await Location.startLocationUpdatesAsync(FREIGHT_BACKGROUND_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 35,
      timeInterval: 15000,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'Seguimiento de carga activo',
        notificationBody: 'ZafraClic mantiene el tracking del servicio para el cliente.',
        notificationColor: '#1E3A8A',
        killServiceOnDestroy: false,
      },
    });

    logInfo('freight.bg.start', 'Tracking background iniciado.', {
      actorId: context.actorId,
      actorRole: context.actorRole,
      freightRequestId: context.freightRequestId,
    });
  } catch (error) {
    logError('freight.bg.start', 'Falló el inicio del tracking background.', {
      actorId: context.actorId,
      actorRole: context.actorRole,
      freightRequestId: context.freightRequestId,
      error: serializeError(error),
    });
    throw error;
  }
}

export async function stopFreightBackgroundTracking(): Promise<void> {
  try {
    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(FREIGHT_BACKGROUND_TASK);
    if (alreadyStarted) {
      await Location.stopLocationUpdatesAsync(FREIGHT_BACKGROUND_TASK);
    }
    await AsyncStorage.removeItem(FREIGHT_BACKGROUND_CONTEXT_KEY);
    logInfo('freight.bg.stop', 'Tracking background detenido.');
  } catch (error) {
    logError('freight.bg.stop', 'Falló al detener tracking background.', {
      error: serializeError(error),
    });
    throw error;
  }
}

export async function hasFreightBackgroundTrackingStarted(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(FREIGHT_BACKGROUND_TASK);
}
