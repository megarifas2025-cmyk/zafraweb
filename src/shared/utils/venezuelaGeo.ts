export const VENEZUELA_DEFAULT_COORD = {
  latitude: 8.0019,
  longitude: -66.1109,
} as const;

export const VENEZUELA_DEFAULT_REGION = {
  latitude: VENEZUELA_DEFAULT_COORD.latitude,
  longitude: VENEZUELA_DEFAULT_COORD.longitude,
  latitudeDelta: 2.8,
  longitudeDelta: 2.8,
} as const;

export function isNearVenezuelaDefaultCenter(lat: number, lng: number): boolean {
  return Math.abs(lat - VENEZUELA_DEFAULT_COORD.latitude) < 0.02 && Math.abs(lng - VENEZUELA_DEFAULT_COORD.longitude) < 0.02;
}
