/* eslint-env node */
/**
 * Configuración Expo única (sin app.json duplicado) + .env para extra / Maps.
 */
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {
  /* sin dotenv */
}

const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '';

/** Base compartida con lo que antes estaba en app.json */
const expoBase = {
  name: 'ZafraClic',
  slug: 'zafraclic',
  version: '1.0.1',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'zafraclic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#FFFFFF',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFFFFF',
    },
    package: 'com.unicornio.agro',
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'INTERNET',
    ],
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.unicornio.agro',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Necesitamos tu ubicación para alertas climáticas y buscar transportistas cercanos.',
      NSCameraUsageDescription: 'Cámara para diagnóstico de plagas, fotos de cultivos y documentación de campo.',
      NSPhotoLibraryUsageDescription: 'Fotos para documentos y cultivos.',
    },
  },
  updates: {
    enabled: false,
    fallbackToCacheTimeout: 0,
  },
  plugins: [
    '@react-native-community/datetimepicker',
    'expo-camera',
    'expo-notifications',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'Acceso a fotos para documentación de cultivos, inspecciones y envío en chats.',
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Necesitamos acceso continuo a tu ubicación para el seguimiento de la carga incluso cuando la app esté en segundo plano.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
};

module.exports = {
  expo: {
    ...expoBase,
    android: {
      ...expoBase.android,
      config: {
        ...(expoBase.android?.config || {}),
        googleMaps: { apiKey: mapsKey },
      },
    },
    extra: {
      eas: {
        projectId: '46076c50-7eb2-44ea-a929-ef95bd7f2422',
      },
      kycBypassEmails: process.env.EXPO_PUBLIC_KYC_BYPASS_EMAILS ?? '',
      kycDisabled: process.env.EXPO_PUBLIC_KYC_DISABLED ?? '',
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      googleMapsAndroidKey: mapsKey,
      /** Solo desarrollo: login de prueba (ver EXPO_PUBLIC_DEV_LOGIN_* en .env) */
      devLoginEmail: process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL ?? '',
      devLoginPassword: process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD ?? '',
    },
  },
};
