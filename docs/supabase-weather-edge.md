# Clima (OpenWeather) y Escudo pluvial

## App actual (React Native)

- `EXPO_PUBLIC_OPENWEATHER_KEY` en `.env`: la app llama a **Current** y **5-day/3h Forecast** desde `weatherService.ts`.
- **Escudo climático** (bitácora `APLICACION_QUIMICA` / `FERTILIZACION`): se suman **2 bloques de 3h** (~6h) y si **≥ 5 mm** se muestra `SmartWeatherAlertModal` (bloqueo suave).

## Edge Function (opcional)

1. Crear función Supabase que reciba `lat`, `lng`, lea `OPENWEATHER_KEY` desde **secrets**.
2. Devolver `{ mm, sinApi }` con la misma suma que `lluviaAcumuladaProximasHoras`.
3. En la app, sustituir la llamada directa por `supabase.functions.invoke('weather-rain-6h', { body: { lat, lng } })` cuando quieras ocultar la key al cliente.
