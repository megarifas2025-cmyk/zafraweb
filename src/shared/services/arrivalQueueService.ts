import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/shared/lib/supabase';

const STORAGE_KEY = 'zafraclic_pending_arrivals_v1';
let _isSyncing = false;

export type RadarRole = 'transporte' | 'empresa' | 'productor';

export type PendingArrival = {
  id: string;
  creado_en: string;
  lat: number;
  lng: number;
  label: string;
  role: RadarRole;
};

function isMissingTableError(err: { code?: string; message?: string }): boolean {
  const m = err.message ?? '';
  return (
    err.code === '42P01' ||
    m.includes('does not exist') ||
    m.includes('schema cache') ||
    m.includes('Could not find the table')
  );
}

async function readAll(): Promise<PendingArrival[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingArrival[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(rows: PendingArrival[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export async function enqueueArrival(
  perfilId: string,
  payload: { lat: number; lng: number; label: string; role: RadarRole },
): Promise<PendingArrival> {
  const row: PendingArrival = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    creado_en: new Date().toISOString(),
    lat: payload.lat,
    lng: payload.lng,
    label: payload.label,
    role: payload.role,
  };
  const all = await readAll();
  all.push(row);
  await writeAll(all);
  void trySyncPending(perfilId);
  return row;
}

export async function trySyncPending(perfilId: string): Promise<void> {
  if (_isSyncing) return;
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  const pending = await readAll();
  if (pending.length === 0) return;

  _isSyncing = true;
  try {
    // Intentar batch insert primero (más eficiente)
    const rows = pending.map((p) => ({
      perfil_id: perfilId,
      lat: p.lat,
      lng: p.lng,
      lugar_label: p.label,
      rol: p.role,
      creado_en: p.creado_en,
    }));
    const { error: batchError } = await supabase.from('arrival_events').insert(rows);
    if (!batchError) {
      await writeAll([]);
      return;
    }
    if (isMissingTableError(batchError)) return;

    // Si el batch falla, intentar uno a uno para identificar los conflictivos
    const still: PendingArrival[] = [];
    for (let i = 0; i < pending.length; i += 1) {
      const p = pending[i]!;
      const { error } = await supabase.from('arrival_events').insert({
        perfil_id: perfilId,
        lat: p.lat,
        lng: p.lng,
        lugar_label: p.label,
        rol: p.role,
        creado_en: p.creado_en,
      });
      if (error) {
        if (isMissingTableError(error)) {
          still.push(...pending.slice(i));
          break;
        }
        still.push(p);
      }
    }
    await writeAll(still);
  } finally {
    _isSyncing = false;
  }
}

export async function listPending(): Promise<PendingArrival[]> {
  return readAll();
}

export async function clearPending(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
