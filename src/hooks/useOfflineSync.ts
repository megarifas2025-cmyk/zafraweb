/**
 * useOfflineSync – Offline-First para zonas rurales sin señal
 *
 * Estrategia:
 *  1. Todas las escrituras se guardan primero en SQLite local.
 *  2. Un listener de red detecta cuando vuelve la conectividad.
 *  3. Al recuperar señal, sincroniza con Supabase en orden.
 *  4. El agricultor nunca pierde datos aunque no tenga internet.
 */
import { useEffect, useRef, useCallback } from 'react';
import * as SQLite from 'expo-sqlite';
import NetInfo     from '@react-native-community/netinfo';
import { supabase } from '@/shared/lib/supabase';
import { logError, logInfo, logWarn, serializeError } from '@/shared/runtime/appLogger';

export type FieldLogTipoDb = 'SIEMBRA' | 'APLICACION_QUIMICA' | 'FERTILIZACION' | 'OTRO';
export type PlagueLocalSeverity = 'baja' | 'media' | 'alta' | 'critica';

const db = SQLite.openDatabaseSync('zafraclic_offline.db');
let offlineDbInitialized = false;

/** UUID v4 sin dependencia extra (IDs para field_logs / cola). */
export function randomUuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Inicializar tablas locales
function initDb() {
  if (offlineDbInitialized) return;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS cola_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabla TEXT NOT NULL,
      operacion TEXT NOT NULL,
      payload TEXT NOT NULL,
      intentos INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now')),
      sincronizado INTEGER DEFAULT 0
    )
  `);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS diario_local (
      id TEXT PRIMARY KEY,
      finca_id TEXT NOT NULL,
      autor_id TEXT NOT NULL,
      fecha TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      fotos TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      sincronizado INTEGER DEFAULT 0
    )
  `);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS fincas_cache (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      actualizado TEXT DEFAULT (datetime('now'))
    )
  `);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS radar_plagas_local (
      id TEXT PRIMARY KEY,
      autor_id TEXT NOT NULL,
      finca_id TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      severidad TEXT NOT NULL,
      foto_url TEXT,
      estado_ve TEXT NOT NULL,
      municipio TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      sincronizado INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS radar_confirmaciones_local (
      id TEXT PRIMARY KEY,
      alerta_id TEXT NOT NULL,
      perfil_id TEXT NOT NULL,
      sincronizado INTEGER DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);
  offlineDbInitialized = true;
}

initDb();

// Guardar entrada del diario localmente (funciona sin internet)
export function guardarDiarioLocal(entrada: {
  id:           string;
  finca_id:     string;
  autor_id:     string;
  fecha:        string;
  tipo:         string;
  tipo_evento:  FieldLogTipoDb;
  descripcion?: string;
  fotos?:       string[];
}) {
  initDb();
  db.runSync(
    `INSERT OR REPLACE INTO diario_local
       (id, finca_id, autor_id, fecha, tipo, descripcion, fotos, sincronizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      entrada.id,
      entrada.finca_id,
      entrada.autor_id,
      entrada.fecha,
      entrada.tipo,
      entrada.descripcion ?? '',
      JSON.stringify(entrada.fotos ?? []),
    ],
  );

  const remotePayload = {
    id: entrada.id,
    productor_id: entrada.autor_id,
    finca_id: entrada.finca_id,
    tipo_evento: entrada.tipo_evento,
    fecha_evento: entrada.fecha,
    notas: entrada.descripcion?.trim() || null,
  };
  db.runSync(
    `INSERT INTO cola_sync (tabla, operacion, payload) VALUES (?, ?, ?)`,
    ['field_logs', 'INSERT', JSON.stringify(remotePayload)],
  );
}

/** Entradas del diario guardadas en el dispositivo (más recientes primero). */
export function listarDiarioLocal(autorId: string): {
  id: string;
  finca_id: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  creado_en: string;
  sincronizado: number;
}[] {
  initDb();
  return db.getAllSync(
    `SELECT id, finca_id, fecha, tipo, descripcion, creado_en, sincronizado
     FROM diario_local WHERE autor_id = ? ORDER BY creado_en DESC`,
    [autorId],
  ) as {
    id: string;
    finca_id: string;
    fecha: string;
    tipo: string;
    descripcion: string;
    creado_en: string;
    sincronizado: number;
  }[];
}

export function eliminarDiarioLocal(id: string) {
  initDb();
  const row = db.getFirstSync<{ sincronizado: number }>(
    `SELECT sincronizado FROM diario_local WHERE id = ?`,
    [id],
  );
  db.runSync(`DELETE FROM diario_local WHERE id = ?`, [id]);
  if (!row) return;
  if (row.sincronizado) {
    db.runSync(
      `INSERT INTO cola_sync (tabla, operacion, payload) VALUES (?, ?, ?)`,
      ['field_logs', 'DELETE', JSON.stringify({ id })],
    );
    return;
  }
  db.runSync(
    `DELETE FROM cola_sync
      WHERE tabla = ?
        AND sincronizado = 0
        AND payload LIKE ?`,
    ['field_logs', `%"id":"${id}"%`],
  );
}

// Cachear fincas para lectura offline
export function cachearFincas(fincas: object[]) {
  initDb();
  for (const f of fincas as any[]) {
    db.runSync(
      `INSERT OR REPLACE INTO fincas_cache (id, data) VALUES (?, ?)`,
      [f.id, JSON.stringify(f)],
    );
  }
}

// Leer fincas del cache local
export function leerFincasLocales(): object[] {
  initDb();
  const rows = db.getAllSync<{ data: string }>(`SELECT data FROM fincas_cache`);
  return rows.flatMap((r) => {
    try {
      return [JSON.parse(r.data)];
    } catch {
      return [];
    }
  });
}

export function guardarReportePlagaLocal(input: {
  id: string;
  autor_id: string;
  finca_id: string;
  titulo: string;
  descripcion?: string | null;
  severidad: PlagueLocalSeverity;
  foto_url?: string | null;
  estado_ve: string;
  municipio: string;
  lat: number;
  lng: number;
}) {
  initDb();
  db.runSync(
    `INSERT OR REPLACE INTO radar_plagas_local
      (id, autor_id, finca_id, titulo, descripcion, severidad, foto_url, estado_ve, municipio, lat, lng, sincronizado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      input.id,
      input.autor_id,
      input.finca_id,
      input.titulo,
      input.descripcion ?? '',
      input.severidad,
      input.foto_url ?? '',
      input.estado_ve,
      input.municipio,
      input.lat,
      input.lng,
    ],
  );

  const remotePayload = {
    id: input.id,
    perfil_id: input.autor_id,
    tipo: 'plaga',
    titulo: input.titulo,
    descripcion: input.descripcion ?? null,
    estado_ve: input.estado_ve,
    municipio: input.municipio,
    coordenadas: `POINT(${input.lng} ${input.lat})`,
    fotos: input.foto_url ? [input.foto_url] : [],
    ia_sugerencia: { severity: input.severidad, source: 'producer_manual_radar' },
  };
  db.runSync(
    `INSERT INTO cola_sync (tabla, operacion, payload) VALUES (?, ?, ?)`,
    ['alertas_waze', 'INSERT', JSON.stringify(remotePayload)],
  );
}

export function listarReportesPlagaLocales(autorId: string): {
  id: string;
  finca_id: string;
  titulo: string;
  descripcion: string;
  severidad: string;
  sincronizado: number;
  creado_en: string;
}[] {
  initDb();
  return db.getAllSync(
    `SELECT id, finca_id, titulo, descripcion, severidad, sincronizado, creado_en
     FROM radar_plagas_local WHERE autor_id = ? ORDER BY creado_en DESC`,
    [autorId],
  ) as {
    id: string;
    finca_id: string;
    titulo: string;
    descripcion: string;
    severidad: string;
    sincronizado: number;
    creado_en: string;
  }[];
}

export function guardarConfirmacionPlagaLocal(input: {
  id: string;
  alerta_id: string;
  perfil_id: string;
}) {
  initDb();
  db.runSync(
    `INSERT OR REPLACE INTO radar_confirmaciones_local (id, alerta_id, perfil_id, sincronizado)
     VALUES (?, ?, ?, 0)`,
    [input.id, input.alerta_id, input.perfil_id],
  );

  const remotePayload = {
    id: input.id,
    alerta_id: input.alerta_id,
    perfil_id: input.perfil_id,
  };
  db.runSync(
    `INSERT INTO cola_sync (tabla, operacion, payload) VALUES (?, ?, ?)`,
    ['alertas_waze_confirmaciones', 'INSERT', JSON.stringify(remotePayload)],
  );
}

export function listarConfirmacionesPlagaLocales(perfilId: string): {
  id: string;
  alerta_id: string;
  sincronizado: number;
  creado_en: string;
}[] {
  initDb();
  return db.getAllSync(
    `SELECT id, alerta_id, sincronizado, creado_en
     FROM radar_confirmaciones_local WHERE perfil_id = ? ORDER BY creado_en DESC`,
    [perfilId],
  ) as {
    id: string;
    alerta_id: string;
    sincronizado: number;
    creado_en: string;
  }[];
}

// Sincronizar cola con Supabase
async function sincronizar() {
  initDb();
  const pendientes = db.getAllSync<{
    id: number; tabla: string; operacion: string; payload: string;
  }>(`SELECT * FROM cola_sync WHERE sincronizado = 0 AND intentos < 3 ORDER BY id ASC LIMIT 20`);

  if (pendientes.length > 0) {
    logInfo('offline.sync', 'Iniciando sincronización de cola offline.', {
      pendingCount: pendientes.length,
    });
  }

  for (const item of pendientes) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(item.payload) as Record<string, unknown>;
    } catch {
      logWarn('offline.sync', 'No se pudo parsear un payload local de la cola.', {
        queueId: item.id,
        tabla: item.tabla,
        operacion: item.operacion,
      });
      db.runSync(`UPDATE cola_sync SET intentos = intentos + 1 WHERE id = ?`, [item.id]);
      continue;
    }
    const payloadId = typeof payload.id === 'string' ? payload.id : null;
    let ok = false;
    try {
      if (item.operacion === 'INSERT') {
        const { error } = await supabase.from(item.tabla).insert(payload);
        ok = !error;
      } else if (item.operacion === 'UPDATE' && payloadId) {
        const { error } = await supabase.from(item.tabla).update(payload).eq('id', payloadId);
        ok = !error;
      } else if (item.operacion === 'DELETE' && payloadId) {
        const { error } = await supabase.from(item.tabla).delete().eq('id', payloadId);
        ok = !error;
      }
    } catch (error) {
      logWarn('offline.sync', 'Fallo temporal sincronizando una entrada de la cola.', {
        queueId: item.id,
        tabla: item.tabla,
        operacion: item.operacion,
        payloadId,
        error: serializeError(error),
      });
    }

    if (ok) {
      db.runSync(`UPDATE cola_sync SET sincronizado = 1 WHERE id = ?`, [item.id]);
      // Marcar en diario local
      if (payloadId && (item.tabla === 'field_logs' || item.tabla === 'diario_campo')) {
        db.runSync(`UPDATE diario_local SET sincronizado = 1 WHERE id = ?`, [payloadId]);
      }
        if (payloadId && item.tabla === 'alertas_waze') {
          db.runSync(`UPDATE radar_plagas_local SET sincronizado = 1 WHERE id = ?`, [payloadId]);
        }
        if (payloadId && item.tabla === 'alertas_waze_confirmaciones') {
          db.runSync(`UPDATE radar_confirmaciones_local SET sincronizado = 1 WHERE id = ?`, [payloadId]);
        }
    } else {
      logWarn('offline.sync', 'Entrada de cola no sincronizada; se incrementa reintento.', {
        queueId: item.id,
        tabla: item.tabla,
        operacion: item.operacion,
        payloadId,
      });
      db.runSync(`UPDATE cola_sync SET intentos = intentos + 1 WHERE id = ?`, [item.id]);
    }
  }
}

// Hook principal
export function useOfflineSync() {
  const sincronizando = useRef(false);

  useEffect(() => {
    initDb();
  }, []);

  const intentarSync = useCallback(async () => {
    if (sincronizando.current) return;
    sincronizando.current = true;
    try {
      await sincronizar();
      logInfo('offline.sync', 'Ciclo de sincronización offline completado.');
    } finally {
      sincronizando.current = false;
    }
  }, []);

  useEffect(() => {
    // Escuchar cambios de red
    const unsub = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) {
        intentarSync().catch((error) => {
          logError('offline.sync', 'Falló el ciclo de sincronización offline.', {
            error: serializeError(error),
          });
        });
      }
    });
    return () => unsub();
  }, [intentarSync]);

  // Contar pendientes para mostrar badge
  function contarPendientes(): number {
    initDb();
    const r = db.getFirstSync<{ c: number }>(
      `SELECT COUNT(*) as c FROM cola_sync WHERE sincronizado = 0`,
    );
    return r?.c ?? 0;
  }

  return {
    guardarDiarioLocal,
    eliminarDiarioLocal,
    cachearFincas,
    leerFincasLocales,
    contarPendientes,
    intentarSync,
    guardarReportePlagaLocal,
    listarReportesPlagaLocales,
    guardarConfirmacionPlagaLocal,
    listarConfirmacionesPlagaLocales,
  };
}
