import * as SQLite from 'expo-sqlite';
import type { FieldInspectionEstatus, InsumoRecomendado } from '@/shared/types';

export interface LocalFieldInspectionRow {
  id: string;
  server_id: string | null;
  empresa_id: string;
  perito_id: string;
  productor_id: string;
  finca_id: string | null;
  fecha_programada: string;
  lat: number | null;
  lng: number | null;
  precision_gps_m: number | null;
  observaciones_tecnicas: string | null;
  resumen_dictamen: string | null;
  insumos_json: string;
  tipo_inspeccion: string | null;
  estado_acta: string | null;
  porcentaje_dano: number | null;
  estimacion_rendimiento_ton: number | null;
  area_verificada_ha: number | null;
  fuera_de_lote: number | null;
  fase_fenologica: string | null;
  malezas_reportadas: string | null;
  plagas_reportadas: string | null;
  recomendacion_insumos: string | null;
  evidencias_fotos_json: string;
  firma_perito_json: string | null;
  firma_productor_json: string | null;
  firmado_en: string | null;
  productor_nombre: string | null;
  productor_telefono: string | null;
  finca_nombre: string | null;
  estatus: FieldInspectionEstatus;
  numero_control: string | null;
  dirty: number;
  updated_at: string;
}

export type SyncQueueStatus = 'pending' | 'failed' | 'sent';

export interface SyncQueueRow {
  id: string;
  payload_json: string;
  photo_uris_json: string;
  status: SyncQueueStatus;
  created_at: string;
  last_error: string | null;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrateLegacyTable(db: SQLite.SQLiteDatabase): Promise<void> {
  const legacy = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='field_inspections_local'`,
  );
  if (!legacy) return;
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(field_inspections_local)`);
  const names = new Set((cols ?? []).map((c) => c.name));
  const required = [
    'id',
    'server_id',
    'empresa_id',
    'perito_id',
    'productor_id',
    'finca_id',
    'fecha_programada',
    'lat',
    'lng',
    'precision_gps_m',
    'observaciones_tecnicas',
    'resumen_dictamen',
    'insumos_json',
    'tipo_inspeccion',
    'estado_acta',
    'porcentaje_dano',
    'estimacion_rendimiento_ton',
    'area_verificada_ha',
    'fuera_de_lote',
    'fase_fenologica',
    'malezas_reportadas',
    'plagas_reportadas',
    'recomendacion_insumos',
    'evidencias_fotos_json',
    'firma_perito_json',
    'firma_productor_json',
    'firmado_en',
    'productor_nombre',
    'productor_telefono',
    'finca_nombre',
    'estatus',
    'numero_control',
    'dirty',
    'updated_at',
  ];
  if (!required.every((name) => names.has(name))) {
    await db.execAsync(`DROP TABLE field_inspections_local;`);
    return;
  }
  await db.execAsync(`
    INSERT OR REPLACE INTO sync_tasks (
      id, server_id, empresa_id, perito_id, productor_id, fecha_programada,
      lat, lng, observaciones_tecnicas, insumos_json, estatus, numero_control, dirty, updated_at
    )
    SELECT
      id, server_id, empresa_id, perito_id, productor_id, fecha_programada,
      lat, lng, observaciones_tecnicas, insumos_json, estatus, numero_control, dirty, updated_at
    FROM field_inspections_local;
    DROP TABLE field_inspections_local;
  `);
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('bunker_field_inspections.db');
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS sync_tasks (
          id TEXT PRIMARY KEY NOT NULL,
          server_id TEXT,
          empresa_id TEXT NOT NULL,
          perito_id TEXT NOT NULL,
          productor_id TEXT NOT NULL,
          finca_id TEXT,
          fecha_programada TEXT NOT NULL,
          lat REAL,
          lng REAL,
          precision_gps_m REAL,
          observaciones_tecnicas TEXT,
          resumen_dictamen TEXT,
          insumos_json TEXT NOT NULL DEFAULT '[]',
          tipo_inspeccion TEXT,
          estado_acta TEXT,
          porcentaje_dano REAL,
          estimacion_rendimiento_ton REAL,
          area_verificada_ha REAL,
          fuera_de_lote INTEGER,
          fase_fenologica TEXT,
          malezas_reportadas TEXT,
          plagas_reportadas TEXT,
          recomendacion_insumos TEXT,
          evidencias_fotos_json TEXT NOT NULL DEFAULT '[]',
          firma_perito_json TEXT,
          firma_productor_json TEXT,
          firmado_en TEXT,
          productor_nombre TEXT,
          productor_telefono TEXT,
          finca_nombre TEXT,
          estatus TEXT NOT NULL,
          numero_control TEXT,
          dirty INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sync_tasks_perito ON sync_tasks(perito_id);
        CREATE INDEX IF NOT EXISTS idx_sync_tasks_dirty ON sync_tasks(dirty);
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          payload_json TEXT NOT NULL,
          photo_uris_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      `);
      const cols = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(sync_tasks)`);
      const colNames = new Set((cols ?? []).map((c) => c.name));
      const alterStatements = [
        ['finca_id', `ALTER TABLE sync_tasks ADD COLUMN finca_id TEXT`],
        ['precision_gps_m', `ALTER TABLE sync_tasks ADD COLUMN precision_gps_m REAL`],
        ['resumen_dictamen', `ALTER TABLE sync_tasks ADD COLUMN resumen_dictamen TEXT`],
        ['tipo_inspeccion', `ALTER TABLE sync_tasks ADD COLUMN tipo_inspeccion TEXT`],
        ['estado_acta', `ALTER TABLE sync_tasks ADD COLUMN estado_acta TEXT`],
        ['porcentaje_dano', `ALTER TABLE sync_tasks ADD COLUMN porcentaje_dano REAL`],
        ['estimacion_rendimiento_ton', `ALTER TABLE sync_tasks ADD COLUMN estimacion_rendimiento_ton REAL`],
        ['area_verificada_ha', `ALTER TABLE sync_tasks ADD COLUMN area_verificada_ha REAL`],
        ['fuera_de_lote', `ALTER TABLE sync_tasks ADD COLUMN fuera_de_lote INTEGER`],
        ['fase_fenologica', `ALTER TABLE sync_tasks ADD COLUMN fase_fenologica TEXT`],
        ['malezas_reportadas', `ALTER TABLE sync_tasks ADD COLUMN malezas_reportadas TEXT`],
        ['plagas_reportadas', `ALTER TABLE sync_tasks ADD COLUMN plagas_reportadas TEXT`],
        ['recomendacion_insumos', `ALTER TABLE sync_tasks ADD COLUMN recomendacion_insumos TEXT`],
        ['evidencias_fotos_json', `ALTER TABLE sync_tasks ADD COLUMN evidencias_fotos_json TEXT NOT NULL DEFAULT '[]'`],
        ['firma_perito_json', `ALTER TABLE sync_tasks ADD COLUMN firma_perito_json TEXT`],
        ['firma_productor_json', `ALTER TABLE sync_tasks ADD COLUMN firma_productor_json TEXT`],
        ['firmado_en', `ALTER TABLE sync_tasks ADD COLUMN firmado_en TEXT`],
        ['productor_nombre', `ALTER TABLE sync_tasks ADD COLUMN productor_nombre TEXT`],
        ['productor_telefono', `ALTER TABLE sync_tasks ADD COLUMN productor_telefono TEXT`],
        ['finca_nombre', `ALTER TABLE sync_tasks ADD COLUMN finca_nombre TEXT`],
      ] as const;
      for (const [name, sql] of alterStatements) {
        if (!colNames.has(name)) {
          await database.execAsync(sql);
        }
      }
      await migrateLegacyTable(database);
      return database;
    })();
  }
  return dbPromise;
}

export async function localUpsertFromServer(row: {
  serverId: string;
  empresa_id: string;
  perito_id: string;
  productor_id: string;
  finca_id?: string | null;
  fecha_programada: string;
  lat: number | null;
  lng: number | null;
  precision_gps_m?: number | null;
  observaciones_tecnicas: string | null;
  resumen_dictamen?: string | null;
  insumos: InsumoRecomendado[];
  tipo_inspeccion?: string | null;
  estado_acta?: string | null;
  porcentaje_dano?: number | null;
  estimacion_rendimiento_ton?: number | null;
  area_verificada_ha?: number | null;
  fuera_de_lote?: boolean | null;
  fase_fenologica?: string | null;
  malezas_reportadas?: string | null;
  plagas_reportadas?: string | null;
  recomendacion_insumos?: string | null;
  evidencias_fotos_json?: string;
  firma_perito_json?: string | null;
  firma_productor_json?: string | null;
  firmado_en?: string | null;
  productor_nombre?: string | null;
  productor_telefono?: string | null;
  finca_nombre?: string | null;
  estatus: FieldInspectionEstatus;
  numero_control: string;
}): Promise<void> {
  const id = row.serverId;
  const existing = await localGetById(id);
  if (existing?.dirty) return;

  const db = await getDb();
  const now = new Date().toISOString();
  const insJson = JSON.stringify(row.insumos);
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_tasks (
      id, server_id, empresa_id, perito_id, productor_id, finca_id, fecha_programada,
      lat, lng, precision_gps_m, observaciones_tecnicas, resumen_dictamen, insumos_json,
      tipo_inspeccion, estado_acta, porcentaje_dano, estimacion_rendimiento_ton, area_verificada_ha,
      fuera_de_lote, fase_fenologica, malezas_reportadas, plagas_reportadas, recomendacion_insumos,
      evidencias_fotos_json, firma_perito_json, firma_productor_json, firmado_en,
      productor_nombre, productor_telefono, finca_nombre, estatus, numero_control, dirty, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      row.serverId,
      row.empresa_id,
      row.perito_id,
      row.productor_id,
      row.finca_id ?? null,
      row.fecha_programada,
      row.lat,
      row.lng,
      row.precision_gps_m ?? null,
      row.observaciones_tecnicas,
      row.resumen_dictamen ?? null,
      insJson,
      row.tipo_inspeccion ?? null,
      row.estado_acta ?? null,
      row.porcentaje_dano ?? null,
      row.estimacion_rendimiento_ton ?? null,
      row.area_verificada_ha ?? null,
      row.fuera_de_lote == null ? null : row.fuera_de_lote ? 1 : 0,
      row.fase_fenologica ?? null,
      row.malezas_reportadas ?? null,
      row.plagas_reportadas ?? null,
      row.recomendacion_insumos ?? null,
      row.evidencias_fotos_json ?? '[]',
      row.firma_perito_json ?? null,
      row.firma_productor_json ?? null,
      row.firmado_en ?? null,
      row.productor_nombre ?? null,
      row.productor_telefono ?? null,
      row.finca_nombre ?? null,
      row.estatus,
      row.numero_control,
      now,
    ],
  );
}

export async function localListForPerito(peritoId: string): Promise<LocalFieldInspectionRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LocalFieldInspectionRow>(
    `SELECT * FROM sync_tasks WHERE perito_id = ? ORDER BY fecha_programada ASC`,
    [peritoId],
  );
  return rows ?? [];
}

export async function localGetById(id: string): Promise<LocalFieldInspectionRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LocalFieldInspectionRow>(
    `SELECT * FROM sync_tasks WHERE id = ?`,
    [id],
  );
  return row ?? null;
}

export async function localSaveDraft(input: {
  id: string;
  observaciones_tecnicas: string | null;
  resumen_dictamen?: string | null;
  insumos: InsumoRecomendado[];
  estatus: FieldInspectionEstatus;
  lat?: number | null;
  lng?: number | null;
  precision_gps_m?: number | null;
  tipo_inspeccion?: string | null;
  estado_acta?: string | null;
  porcentaje_dano?: number | null;
  estimacion_rendimiento_ton?: number | null;
  area_verificada_ha?: number | null;
  fuera_de_lote?: boolean | null;
  fase_fenologica?: string | null;
  malezas_reportadas?: string | null;
  plagas_reportadas?: string | null;
  recomendacion_insumos?: string | null;
  evidencias_fotos_json?: string;
  firma_perito_json?: string | null;
  firma_productor_json?: string | null;
  firmado_en?: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_tasks SET
      observaciones_tecnicas = ?,
      resumen_dictamen = COALESCE(?, resumen_dictamen),
      insumos_json = ?,
      estatus = ?,
      precision_gps_m = COALESCE(?, precision_gps_m),
      tipo_inspeccion = COALESCE(?, tipo_inspeccion),
      estado_acta = COALESCE(?, estado_acta),
      porcentaje_dano = COALESCE(?, porcentaje_dano),
      estimacion_rendimiento_ton = COALESCE(?, estimacion_rendimiento_ton),
      area_verificada_ha = COALESCE(?, area_verificada_ha),
      fuera_de_lote = COALESCE(?, fuera_de_lote),
      fase_fenologica = COALESCE(?, fase_fenologica),
      malezas_reportadas = COALESCE(?, malezas_reportadas),
      plagas_reportadas = COALESCE(?, plagas_reportadas),
      recomendacion_insumos = COALESCE(?, recomendacion_insumos),
      evidencias_fotos_json = COALESCE(?, evidencias_fotos_json),
      firma_perito_json = COALESCE(?, firma_perito_json),
      firma_productor_json = COALESCE(?, firma_productor_json),
      firmado_en = COALESCE(?, firmado_en),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      dirty = 1,
      updated_at = ?
    WHERE id = ?`,
    [
      input.observaciones_tecnicas,
      input.resumen_dictamen ?? null,
      JSON.stringify(input.insumos),
      input.estatus,
      input.precision_gps_m ?? null,
      input.tipo_inspeccion ?? null,
      input.estado_acta ?? null,
      input.porcentaje_dano ?? null,
      input.estimacion_rendimiento_ton ?? null,
      input.area_verificada_ha ?? null,
      input.fuera_de_lote == null ? null : input.fuera_de_lote ? 1 : 0,
      input.fase_fenologica ?? null,
      input.malezas_reportadas ?? null,
      input.plagas_reportadas ?? null,
      input.recomendacion_insumos ?? null,
      input.evidencias_fotos_json ?? null,
      input.firma_perito_json ?? null,
      input.firma_productor_json ?? null,
      input.firmado_en ?? null,
      input.lat ?? null,
      input.lng ?? null,
      now,
      input.id,
    ],
  );
}

export async function localMarkClean(id: string, serverEstatus: FieldInspectionEstatus): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sync_tasks SET dirty = 0, estatus = ?, updated_at = ? WHERE id = ?`,
    [serverEstatus, new Date().toISOString(), id],
  );
}

export async function localApplyQueuedInspection(input: {
  id: string;
  observaciones_tecnicas: string | null;
  resumen_dictamen?: string | null;
  insumos: InsumoRecomendado[];
  estatus: FieldInspectionEstatus;
  lat?: number | null;
  lng?: number | null;
  precision_gps_m?: number | null;
  tipo_inspeccion?: string | null;
  estado_acta?: string | null;
  porcentaje_dano?: number | null;
  estimacion_rendimiento_ton?: number | null;
  area_verificada_ha?: number | null;
  fuera_de_lote?: boolean | null;
  fase_fenologica?: string | null;
  malezas_reportadas?: string | null;
  plagas_reportadas?: string | null;
  recomendacion_insumos?: string | null;
  evidencias_fotos_json?: string;
  firma_perito_json?: string | null;
  firma_productor_json?: string | null;
  firmado_en?: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_tasks SET
      observaciones_tecnicas = ?,
      resumen_dictamen = COALESCE(?, resumen_dictamen),
      insumos_json = ?,
      estatus = ?,
      precision_gps_m = COALESCE(?, precision_gps_m),
      tipo_inspeccion = COALESCE(?, tipo_inspeccion),
      estado_acta = COALESCE(?, estado_acta),
      porcentaje_dano = COALESCE(?, porcentaje_dano),
      estimacion_rendimiento_ton = COALESCE(?, estimacion_rendimiento_ton),
      area_verificada_ha = COALESCE(?, area_verificada_ha),
      fuera_de_lote = COALESCE(?, fuera_de_lote),
      fase_fenologica = COALESCE(?, fase_fenologica),
      malezas_reportadas = COALESCE(?, malezas_reportadas),
      plagas_reportadas = COALESCE(?, plagas_reportadas),
      recomendacion_insumos = COALESCE(?, recomendacion_insumos),
      evidencias_fotos_json = COALESCE(?, evidencias_fotos_json),
      firma_perito_json = COALESCE(?, firma_perito_json),
      firma_productor_json = COALESCE(?, firma_productor_json),
      firmado_en = COALESCE(?, firmado_en),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng),
      dirty = 0,
      updated_at = ?
    WHERE id = ?`,
    [
      input.observaciones_tecnicas,
      input.resumen_dictamen ?? null,
      JSON.stringify(input.insumos),
      input.estatus,
      input.precision_gps_m ?? null,
      input.tipo_inspeccion ?? null,
      input.estado_acta ?? null,
      input.porcentaje_dano ?? null,
      input.estimacion_rendimiento_ton ?? null,
      input.area_verificada_ha ?? null,
      input.fuera_de_lote == null ? null : input.fuera_de_lote ? 1 : 0,
      input.fase_fenologica ?? null,
      input.malezas_reportadas ?? null,
      input.plagas_reportadas ?? null,
      input.recomendacion_insumos ?? null,
      input.evidencias_fotos_json ?? null,
      input.firma_perito_json ?? null,
      input.firma_productor_json ?? null,
      input.firmado_en ?? null,
      input.lat ?? null,
      input.lng ?? null,
      now,
      input.id,
    ],
  );
}

export async function localListDirty(peritoId: string): Promise<LocalFieldInspectionRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LocalFieldInspectionRow>(
    `SELECT * FROM sync_tasks WHERE perito_id = ? AND dirty = 1`,
    [peritoId],
  );
  return rows ?? [];
}

export async function enqueueInspectionReport(input: {
  id: string;
  payloadJson: string;
  photoUris: string[];
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_queue (id, payload_json, photo_uris_json, status, created_at, last_error)
     VALUES (?, ?, ?, 'pending', ?, NULL)`,
    [input.id, input.payloadJson, JSON.stringify(input.photoUris), now],
  );
}

export async function localListPendingQueue(): Promise<SyncQueueRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SyncQueueRow>(
    `SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC`,
  );
  return rows ?? [];
}

export async function localDeleteQueueItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

export async function localMarkQueueFailed(id: string, err: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sync_queue SET status = 'failed', last_error = ? WHERE id = ?`, [err, id]);
}
