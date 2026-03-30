/**
 * Tipos alineados al schema Supabase (tablas nuevas + columnas añadidas).
 * Regenerar desde el CLI (`supabase gen types`) cuando el schema crezca; este archivo cubre el delta nacional/comercial.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Delta: `database/delta-perfiles-disponibilidad-flete.sql` */
export interface PerfilDisponibilidadFlete {
  disponibilidad_flete: boolean | null;
}

// --- requerimientos_compra ---
export interface RequerimientoCompraRow {
  id: string;
  comprador_id: string;
  rubro: string;
  cantidad: number;
  precio_estimado: number | null;
  ubicacion_estado: string;
  fecha_limite: string;
  /** Enrutamiento comercial (filas antiguas pueden ser null antes de backfill). */
  categoria_destino?: string | null;
  creado_en: string;
}

export interface RequerimientoCompraInsert {
  id?: string;
  comprador_id: string;
  rubro: string;
  cantidad: number;
  precio_estimado?: number | null;
  ubicacion_estado: string;
  fecha_limite: string;
  /** Obligatorio en nuevas altas — ver `CATEGORIA_DESTINO_REQUERIMIENTO` en marketDemandService. */
  categoria_destino: string;
  creado_en?: string;
}

export type RequerimientoCompraUpdate = Partial<
  Omit<RequerimientoCompraInsert, 'comprador_id'>
> & { comprador_id?: string };

// --- lotes_financiados ---
export interface LoteFinanciadoRow {
  id: string;
  company_id: string;
  productor_id: string;
  finca_id: string;
  sub_lote_nombre?: string | null;
  hectareas_asignadas?: number | null;
  creado_en: string;
}

export interface LoteFinanciadoInsert {
  id?: string;
  company_id: string;
  productor_id: string;
  finca_id: string;
  sub_lote_nombre?: string | null;
  hectareas_asignadas?: number | null;
  creado_en?: string;
}

export type LoteFinanciadoUpdate = Partial<LoteFinanciadoInsert>;

/** Fragmento de cosechas relevante para el campo añadido en el delta. */
export interface CosechaUbicacionNacional {
  ubicacion_estado: string | null;
}

/**
 * Subconjunto tipado para `createClient<Database>()` (opcional).
 * Ampliar con el resto de tablas cuando se unifique el cliente.
 */
export interface Database {
  public: {
    Tables: {
      requerimientos_compra: {
        Row: RequerimientoCompraRow;
        Insert: RequerimientoCompraInsert;
        Update: RequerimientoCompraUpdate;
        Relationships: [
          {
            foreignKeyName: 'requerimientos_compra_comprador_id_fkey';
            columns: ['comprador_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      lotes_financiados: {
        Row: LoteFinanciadoRow;
        Insert: LoteFinanciadoInsert;
        Update: LoteFinanciadoUpdate;
        Relationships: [
          {
            foreignKeyName: 'lotes_financiados_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lotes_financiados_productor_id_fkey';
            columns: ['productor_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lotes_financiados_finca_id_fkey';
            columns: ['finca_id'];
            isOneToOne: false;
            referencedRelation: 'fincas';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
