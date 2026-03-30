import * as Location from 'expo-location';
import { supabase } from '@/shared/lib/supabase';
import { normalizarEstadoVenezuela, normalizarMunicipioVenezuela } from '@/shared/data/venezuelaMunicipios';
import type { Perfil } from '@/shared/types';

type PerfilLocationSyncInput = Pick<Perfil, 'id' | 'estado_ve' | 'municipio'>;

export type PerfilLocationSyncResult = {
  permission: 'granted' | 'denied';
  changedProfileFields: boolean;
  estado_ve: string | null;
  municipio: string | null;
};

function toEwktPoint(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function normalizeLoose(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function pickMunicipio(address: Location.LocationGeocodedAddress | null, estado: string | null): string | null {
  if (!address) return null;
  const candidates = [address.subregion, address.city, address.district, address.street];
  for (const item of candidates) {
    const normalized = normalizarMunicipioVenezuela(estado, item ?? null);
    if (normalized) return normalized;
  }
  return null;
}

function isUnavailableLocationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('current location is unavailable')
    || normalized.includes('location provider is unavailable')
    || normalized.includes('location services are disabled');
}

export async function syncPerfilLocationFromDevice(input: PerfilLocationSyncInput): Promise<PerfilLocationSyncResult> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return {
      permission: 'denied',
      changedProfileFields: false,
      estado_ve: input.estado_ve || null,
      municipio: input.municipio ?? null,
    };
  }

  let position: Location.LocationObject;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  } catch (error) {
    if (isUnavailableLocationError(error)) {
      return {
        permission: 'granted',
        changedProfileFields: false,
        estado_ve: input.estado_ve || null,
        municipio: input.municipio ?? null,
      };
    }
    throw error;
  }
  const places = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });

  const best = places.find((item) => normalizarEstadoVenezuela(item.region ?? item.subregion ?? null)) ?? places[0] ?? null;
  const nextEstado =
    normalizarEstadoVenezuela(best?.region ?? best?.subregion ?? null) ??
    (input.estado_ve?.trim() ? input.estado_ve.trim() : null);
  const nextMunicipio = pickMunicipio(best, nextEstado) ?? (input.municipio?.trim() ? input.municipio.trim() : null);

  const estadoChanged = normalizeLoose(nextEstado) !== normalizeLoose(input.estado_ve);
  const municipioChanged = normalizeLoose(nextMunicipio) !== normalizeLoose(input.municipio);

  if (!estadoChanged && !municipioChanged) {
    return {
      permission: 'granted',
      changedProfileFields: false,
      estado_ve: nextEstado,
      municipio: nextMunicipio,
    };
  }

  const patch: { estado_ve?: string; municipio?: string | null; ubicacion_point: string } = {
    ubicacion_point: toEwktPoint(position.coords.latitude, position.coords.longitude),
  };
  if (nextEstado) patch.estado_ve = nextEstado;
  patch.municipio = nextMunicipio;

  const { error } = await supabase.from('perfiles').update(patch).eq('id', input.id);
  if (error) throw error;

  await supabase.auth.updateUser({
    data: {
      estado_ve: nextEstado,
      municipio: nextMunicipio,
    },
  });

  return {
    permission: 'granted',
    changedProfileFields: true,
    estado_ve: nextEstado,
    municipio: nextMunicipio,
  };
}
