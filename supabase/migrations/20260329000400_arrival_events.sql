-- ================================================================
-- Migración: arrival_events (confirmar llegada transportista)
-- Equivalente a database/delta-arrival-events.sql
-- ================================================================

CREATE TABLE IF NOT EXISTS public.arrival_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id   UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  lugar_label TEXT,
  rol         TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arrival_events_perfil
  ON public.arrival_events (perfil_id, creado_en DESC);

ALTER TABLE public.arrival_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arrival_events_insert_own" ON public.arrival_events;
CREATE POLICY "arrival_events_insert_own" ON public.arrival_events FOR INSERT
  WITH CHECK (auth.uid() = perfil_id);

DROP POLICY IF EXISTS "arrival_events_select_own" ON public.arrival_events;
CREATE POLICY "arrival_events_select_own" ON public.arrival_events FOR SELECT
  USING (auth.uid() = perfil_id);

DROP POLICY IF EXISTS "arrival_events_ceo_all" ON public.arrival_events;
CREATE POLICY "arrival_events_ceo_all" ON public.arrival_events FOR ALL
  USING (public.is_zafra_ceo());
