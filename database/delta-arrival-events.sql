-- =============================================================================
-- Opcional: cola “Llegué” sincronizada (Radar GPS) — arrival_events
-- =============================================================================
-- Ejecutar si quieres persistir llegadas en Supabase además de AsyncStorage local.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.arrival_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  lugar_label text,
  rol text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arrival_events_perfil ON public.arrival_events(perfil_id, creado_en DESC);

ALTER TABLE public.arrival_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arrival_events_insert_own" ON public.arrival_events;
CREATE POLICY "arrival_events_insert_own" ON public.arrival_events FOR INSERT
  WITH CHECK (auth.uid() = perfil_id);

DROP POLICY IF EXISTS "arrival_events_select_own" ON public.arrival_events;
CREATE POLICY "arrival_events_select_own" ON public.arrival_events FOR SELECT
  USING (auth.uid() = perfil_id);
