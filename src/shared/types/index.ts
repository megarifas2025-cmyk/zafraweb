// ================================================================
// TIPOS GLOBALES – ZafraClic v2
// Roles (+ agrotienda) | Mercado Ciego | KYC verified
// ================================================================

export type RolUsuario =
  | 'zafra_ceo'
  | 'company'
  | 'perito'
  | 'independent_producer'
  | 'buyer'
  | 'transporter'
  | 'agrotienda';

export type DocPrefijo = 'V' | 'E' | 'J' | 'G';
export type CategoriaInsumo = 'quimicos' | 'semillas' | 'maquinaria';
export type LineaCatalogoAgrotienda = 'insumos' | 'repuestos';

/** Valores de `requerimientos_compra.categoria_destino` — enrutamiento a Agrotienda / Productor / Empresa. */
export type CategoriaDestinoRequerimiento =
  | 'Insumos y Maquinaria'
  | 'Cosecha a Granel'
  | 'Volumen Procesado / Silos';

export type KycEstado = 'pendiente' | 'en_revision' | 'verified' | 'rechazado' | 'bloqueado';
export type CosechaEstado = 'borrador' | 'publicada' | 'negociando' | 'vendida' | 'cancelada';
export type FleteEstado = 'available' | 'asignado' | 'en_ruta' | 'completado' | 'cancelado';
export type AlertaWazeEstado = 'no_verificada' | 'verificada';
export type TransporterCompanyLinkStatus = 'pending' | 'approved' | 'rejected';
export type TransporterRegistrationMode = 'particular' | 'company_link';

export interface Perfil {
  id:           string;
  rol:          RolUsuario;
  nombre:       string;
  telefono:     string | null;
  estado_ve:    string;
  municipio:    string | null;
  kyc_estado:   KycEstado;
  kyc_fecha:    string | null;
  avatar_url:   string | null;
  reputacion:   number;
  total_tratos: number;
  /** Confianza plataforma (0–100); mutación solo admin en BD. */
  trust_score?:       number;
  zafras_completadas?: number;
  activo:       boolean;
  bloqueado:    boolean;
  creado_en:    string;
  /** Token Expo Push guardado en BD para notificaciones fuera de la app. */
  expo_push_token?: string | null;
  doc_prefijo?: DocPrefijo | null;
  doc_numero?: string | null;
  /** ISO yyyy-mm-dd */
  fecha_nacimiento?: string | null;
  /** Transportista: toggle «Buscando carga» (delta-perfiles-disponibilidad-flete.sql). */
  disponibilidad_flete?: boolean | null;
}

/** Catálogo agrotienda: una sola pizarra, dos líneas comerciales (`insumos` y `repuestos`). */
export interface AgriculturalInput {
  id:              string;
  perfil_id:       string;
  nombre_producto: string;
  linea_catalogo?: LineaCatalogoAgrotienda | null;
  categoria:       CategoriaInsumo;
  subcategoria?:   string | null;
  descripcion:     string | null;
  imagen_url:      string | null;
  disponibilidad:  boolean;
  precio?:         number | null;
  /** Unidades en inventario. NULL = sin control de stock. 0 = agotado. */
  stock_actual?:   number | null;
  creado_en?:      string;
  actualizado_en?: string;
}

export type FreightRequestEstado = 'abierta' | 'con_postulaciones' | 'asignada' | 'cancelada' | 'completada';
export type FreightApplicationEstado = 'pendiente' | 'aceptada' | 'rechazada';
export type FreightTrackingStatus =
  | 'assigned_pending_prep'
  | 'prepared'
  | 'departed_origin'
  | 'in_transit'
  | 'signal_lost'
  | 'arrived_destination'
  | 'received';

export interface FreightRequest {
  id:                        string;
  requester_id:              string;
  requester_role:            RolUsuario;
  tipo_servicio:             string;
  origen_estado:             string;
  origen_municipio:          string;
  destino_estado:            string | null;
  destino_municipio:         string | null;
  fecha_necesaria:           string;
  descripcion:               string | null;
  peso_estimado_kg:          number | null;
  estado:                    FreightRequestEstado;
  tracking_status?:          FreightTrackingStatus | null;
  assigned_transportista_id: string | null;
  /** Unidad de flota interna (empresa); ver database/delta-freight-fleet-unit-link.sql */
  fleet_unit_id?:            string | null;
  vehiculo_id?:              string | null;
  driver_name?:              string | null;
  driver_phone?:             string | null;
  driver_document?:          string | null;
  driver_has_app?:           boolean | null;
  driver_has_gps?:           boolean | null;
  driver_notes?:             string | null;
  creado_en?:                string;
  actualizado_en?:           string;
  applications?:             FreightRequestApplication[];
  requester?:                Pick<Perfil, 'nombre'>;
  /** Join opcional desde `listarPizarraFreight` (perfiles.nombre). */
  perfiles?:                 { nombre: string } | null;
}

export interface FreightRequestApplication {
  id:                 string;
  freight_request_id: string;
  transportista_id:   string;
  mensaje:            string | null;
  estado:             FreightApplicationEstado;
  creado_en?:         string;
  transportista?:     Pick<Perfil, 'nombre' | 'reputacion' | 'telefono'>;
}

/** Sala 1:1 con freight_request tras aceptar postulación. */
export interface LogisticsSala {
  id:                   string;
  freight_request_id:   string;
  requester_id:         string;
  transportista_id:     string;
  trato_cerrado?:       boolean;
  cerrado_en?:          string | null;
  creado_en?:           string;
  freight_requests?:    Pick<FreightRequest, 'tipo_servicio' | 'origen_municipio' | 'origen_estado' | 'fecha_necesaria' | 'estado'> | null;
  /** Nombre del transportista (join perfiles) — presente en queries del solicitante */
  perfiles?:            { nombre: string } | null;
}

export interface LogisticsMensaje {
  id:         string;
  sala_id:    string;
  autor_id:   string;
  contenido:  string;
  tipo?:      string;
  media_url?: string | null;
  creado_en:  string;
}

/** Sala de negociación pre-acuerdo entre comprador y agrotienda sobre un insumo */
export interface SalaInsumosChat {
  id:                string;
  insumo_id:         string;
  buyer_id:          string;
  vendedor_id:       string;
  venta_confirmada:  boolean;
  confirmada_en?:    string | null;
  creado_en?:        string;
  /** Join agricultural_inputs */
  insumo?:           Pick<AgriculturalInput, 'id' | 'nombre_producto' | 'categoria' | 'linea_catalogo'> | null;
  /** Nombre del comprador (join perfiles) */
  buyer_nombre?:     string | null;
  /** Último mensaje (de la RPC listar_salas_insumos_vendedor) */
  ultimo_mensaje?:   string | null;
  ultimo_mensaje_en?: string | null;
}

export interface MensajeInsumosChat {
  id:        string;
  sala_id:   string;
  autor_id:  string;
  contenido?: string | null;
  tipo?:     string;
  media_url?: string | null;
  creado_en: string;
}

export type FreightTrackingEventType = 'departed_origin' | 'location_ping' | 'arrived_destination';

export interface FreightTrackingUpdate {
  id:                 string;
  freight_request_id: string;
  actor_id:           string;
  actor_role:         RolUsuario;
  event_type:         FreightTrackingEventType;
  lat:                number;
  lng:                number;
  accuracy_m?:        number | null;
  label?:             string | null;
  creado_en:          string;
}

export interface Company {
  id:                  string;
  perfil_id:           string;
  razon_social:        string;
  rif:                 string;
  logo_url:            string | null;
  direccion:           string | null;
  direccion_fiscal?:   string | null;
  telefono_contacto?:  string | null;
  correo_contacto?:    string | null;
  descripcion:         string | null;
}

export interface CompanyDirectoryEntry {
  id: string;
  razon_social: string;
  rif: string;
}

export type BuyerNearbySupplierKind = 'agrotienda' | 'company';

export interface BuyerNearbySupplier {
  id: string;
  kind: BuyerNearbySupplierKind;
  display_name: string;
  subtitle: string | null;
  distance_m: number;
  available_items: number;
  phone: string | null;
  logo_url: string | null;
  lat: number;
  lng: number;
}

export interface RatingEntry {
  id: string;
  evaluador_id: string;
  evaluado_id: string;
  cosecha_id: string | null;
  puntaje: number;
  comentario: string | null;
  creado_en: string;
  evaluador?: Pick<Perfil, 'nombre' | 'avatar_url'> | null;
}

export interface AdminAuditLogEntry {
  id: string;
  actor_id: string;
  actor_role: RolUsuario;
  action: string;
  target_table: string | null;
  target_id: string | null;
  target_label: string | null;
  reason: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

export interface UiEventLogEntry {
  id: string;
  actor_id: string;
  actor_role: RolUsuario | null;
  session_key: string;
  event_type: 'screen_view' | 'tap' | 'submit' | 'open_modal' | 'close_modal' | 'navigate' | 'error_ui' | 'state_change';
  event_name: string;
  screen: string | null;
  module: string | null;
  target_type: string | null;
  target_id: string | null;
  status: string | null;
  metadata?: Record<string, unknown> | null;
  app_version: string | null;
  platform: string | null;
  created_at: string;
}

export interface SessionLoginLogEntry {
  id: string;
  actor_id: string;
  actor_role: RolUsuario | null;
  session_key: string;
  platform: string | null;
  app_version: string | null;
  device_label: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  estado_ve: string | null;
  municipio: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface CeoObservabilitySummary {
  events_total: number;
  unique_users: number;
  login_count: number;
  ui_errors: number;
  top_screens: Array<{ screen: string; total: number }>;
  roles: Array<{ role: string; total: number }>;
}

export interface TransporterCompanyLink {
  id: string;
  transporter_id: string;
  company_id: string;
  status: TransporterCompanyLinkStatus;
  creado_en: string;
  actualizado_en?: string | null;
  transporter?: Pick<Perfil, 'id' | 'nombre' | 'telefono' | 'municipio'> | null;
  company?: Pick<Company, 'id' | 'razon_social' | 'rif' | 'telefono_contacto'> | null;
}

export type FieldInspectionEstatus = 'pending' | 'in_progress' | 'synced' | 'approved';

export type InspectionTipo =
  | 'evaluacion_danos'
  | 'estimacion_precosecha'
  | 'auditoria_insumos'
  | 'certificacion_calidad'
  | 'seguimiento_tecnico';

export type InspectionActaEstado =
  | 'borrador_local'
  | 'levantada_en_campo'
  | 'firmada_perito'
  | 'firmada_productor'
  | 'completa'
  | 'certificada'
  | 'rechazada';

export interface InspectionSignatureRecord {
  nombre: string;
  documento?: string | null;
  signed_at: string;
  lat?: number | null;
  lng?: number | null;
  accuracy_m?: number | null;
  svg_path: string;
}

export interface InspectionPhotoEvidence {
  path: string;
  captured_at: string;
  lat?: number | null;
  lng?: number | null;
  accuracy_m?: number | null;
  kind?: string | null;
}

export interface InsumoRecomendado {
  nombre: string;
  dosis?: string | null;
  notas?: string | null;
}

export interface FieldInspection {
  id:                     string;
  numero_control:         string;
  empresa_id:             string;
  perito_id:              string;
  productor_id:           string;
  finca_id?:              string | null;
  fecha_programada:       string;
  coordenadas_gps:        { lat: number; lng: number } | null;
  tipo_inspeccion?:       InspectionTipo | null;
  estado_acta?:           InspectionActaEstado | null;
  observaciones_tecnicas: string | null;
  resumen_dictamen?:      string | null;
  insumos_recomendados:   InsumoRecomendado[];
  estatus:                FieldInspectionEstatus;
  porcentaje_dano?:       number | null;
  estimacion_rendimiento_ton?: number | null;
  area_verificada_ha?:    number | null;
  precision_gps_m?:       number | null;
  fuera_de_lote?:         boolean | null;
  fotos_urls?:            string[] | null;
  evidencias_fotos?:      InspectionPhotoEvidence[] | null;
  firma_perito?:          InspectionSignatureRecord | null;
  firma_productor?:       InspectionSignatureRecord | null;
  firmado_en?:            string | null;
  fase_fenologica?:       string | null;
  malezas_reportadas?:    string | null;
  plagas_reportadas?:     string | null;
  recomendacion_insumos?: string | null;
  creado_en?:             string;
  actualizado_en?:        string;
  finca?:                 Pick<Finca, 'id' | 'nombre' | 'municipio' | 'estado_ve' | 'coordenadas' | 'hectareas'> | null;
  perito?:                Pick<Perfil, 'id' | 'nombre' | 'telefono'> | null;
  productor?:             Pick<Perfil, 'id' | 'nombre' | 'telefono' | 'municipio' | 'estado_ve'> | null;
  companies?:             Pick<
    Company,
    'razon_social' | 'rif' | 'logo_url' | 'direccion' | 'direccion_fiscal' | 'telefono_contacto' | 'correo_contacto'
  > | null;
}

export interface Finca {
  id:             string;
  propietario_id: string;
  company_id:     string | null;
  nombre:         string;
  estado_ve:      string;
  municipio:      string;
  parroquia:      string | null;
  coordenadas:    { lat: number; lng: number } | null;
  hectareas:      number;
  rubro:          string;
  rubros_extras:  string[] | null;
  foto_url:       string | null;
  activa:         boolean;
}

/** Mercado Ciego: SIN precio público. Solo volumen, rubro, condición, ubicación */
export interface Cosecha {
  id:               string;
  agricultor_id:    string;
  finca_id:         string;
  rubro:            string;
  variedad:         string | null;
  cantidad_kg:      number;
  condicion:        string;
  fecha_disponible: string;
  estado:           CosechaEstado;
  descripcion:      string | null;
  fotos:            string[] | null;
  /** Segmentación nacional (filtro principal en mercado); si falta/null, el listado usa `estado_ve` (legacy). */
  ubicacion_estado?: string | null;
  estado_ve:        string;
  municipio:        string;
  vistas:           number;
  publicado_en:     string | null;
  creado_en:        string;
  pct_humedad:      number | null;
  pct_impureza:    number | null;
  perfil?:          Pick<Perfil, 'nombre' | 'reputacion' | 'avatar_url' | 'trust_score'>;
  /** Join mercado comprador (finca → GPS distancia). */
  finca?:           Pick<Finca, 'coordenadas' | 'nombre'> | null;
}

export interface Vehiculo {
  id:             string;
  propietario_id: string;
  company_id:     string | null;
  tipo:           string;
  placa:          string;
  marca:          string | null;
  modelo:         string | null;
  anio:           number | null;
  color?:         string | null;
  carroceria?:    string | null;
  ejes?:          number | null;
  driver_has_gps_phone?: boolean | null;
  driver_app_ready?: boolean | null;
  device_notes?:   string | null;
  capacidad_kg:   number | null;
  foto_url:       string | null;
  activo:         boolean;
}

export interface Flete {
  id:               string;
  transportista_id: string;
  vehiculo_id:      string;
  origen_estado:    string;
  origen_municipio: string;
  precio_kg:        number | null;
  moneda:          string;
  fecha_disponible: string;
  estado:           FleteEstado;
  perfil?:          Pick<Perfil, 'nombre' | 'reputacion' | 'telefono'>;
  vehiculo?:        Pick<Vehiculo, 'tipo' | 'placa' | 'capacidad_kg'>;
}

export interface Mensaje {
  id:        string;
  sala_id:   string;
  autor_id:  string;
  contenido: string;
  nonce:     string;
  tipo:      string;
  media_url?: string | null;
  leido:     boolean;
  creado_en: string;
}

export type ChatIncidentCategory =
  | 'fraud_attempt'
  | 'obscene_language'
  | 'threat'
  | 'fake_document'
  | 'unsafe_payment'
  | 'manual_report'
  | 'other';

export type ChatIncidentStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export interface ChatIncident {
  id: string;
  source: 'market' | 'logistics';
  sala_id: string | null;
  logistics_sala_id: string | null;
  reported_by: string | null;
  offender_id: string | null;
  category: ChatIncidentCategory;
  severity: 'media' | 'alta' | 'critica';
  message_excerpt: string | null;
  reason: string | null;
  status: ChatIncidentStatus;
  auto_detected: boolean;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
}

export interface ChatAuditMessage {
  id: string;
  incident_id: string;
  source: 'market' | 'logistics';
  chat_id: string;
  author_id: string | null;
  author_name: string | null;
  contenido: string;
  tipo: string;
  media_url?: string | null;
  created_at: string;
}

export interface SalaChat {
  id:              string;
  cosecha_id:      string | null;
  comprador_id:    string;
  agricultor_id:   string;
  cerrada:         boolean;
  trato_cerrado:   boolean;
  precio_acordado: number | null;
  moneda:          string;
  creado_en:       string;
  cosecha?:        Pick<Cosecha, 'rubro' | 'cantidad_kg' | 'estado_ve'>;
  comprador?:      Pick<Perfil, 'nombre' | 'avatar_url'>;
  agricultor?:     Pick<Perfil, 'nombre' | 'avatar_url'>;
}

export interface AlertaClima {
  id:        string;
  perfil_id: string;
  tipo:      string;
  titulo:    string;
  mensaje:   string;
  severidad: 'baja' | 'media' | 'alta' | 'critica';
  leida:     boolean;
  expira_en: string | null;
  creado_en: string;
}

export interface AlertaWaze {
  id:             string;
  perfil_id:      string;
  tipo:           string;
  titulo:         string;
  descripcion:    string | null;
  coordenadas:    { lat: number; lng: number };
  estado_ve:      string;
  municipio:      string;
  estado:         AlertaWazeEstado;
  confirmaciones: number;
  fotos:          string[] | null;
  creado_en:      string;
}

export type {
  Database,
  Json,
  LoteFinanciadoInsert,
  LoteFinanciadoRow,
  LoteFinanciadoUpdate,
  RequerimientoCompraInsert,
  RequerimientoCompraRow,
  RequerimientoCompraUpdate,
} from './database.types';

export interface TickerItem {
  id:         string;
  tipo:       'alerta_waze' | 'clima' | 'oferta' | 'publicidad' | 'noticia';
  texto:      string;
  estado_ve:  string | null;
  prioridad:  number;
  patrocinado?: boolean;
}
