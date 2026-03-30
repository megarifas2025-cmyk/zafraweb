CREATE TABLE IF NOT EXISTS public.ui_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_role public.rol_usuario,
  session_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'screen_view',
    'tap',
    'submit',
    'open_modal',
    'close_modal',
    'navigate',
    'error_ui',
    'state_change'
  )),
  event_name TEXT NOT NULL,
  screen TEXT,
  module TEXT,
  target_type TEXT,
  target_id TEXT,
  status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  app_version TEXT,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ui_event_logs_actor_created
  ON public.ui_event_logs(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ui_event_logs_role_created
  ON public.ui_event_logs(actor_role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ui_event_logs_screen_created
  ON public.ui_event_logs(screen, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ui_event_logs_event_name_created
  ON public.ui_event_logs(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ui_event_logs_session_created
  ON public.ui_event_logs(session_key, created_at DESC);

ALTER TABLE public.ui_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ui_event_logs_actor_select" ON public.ui_event_logs;
CREATE POLICY "ui_event_logs_actor_select" ON public.ui_event_logs FOR SELECT
  USING (auth.uid() = actor_id);

DROP POLICY IF EXISTS "ui_event_logs_ceo_select" ON public.ui_event_logs;
CREATE POLICY "ui_event_logs_ceo_select" ON public.ui_event_logs FOR SELECT
  USING (public.is_zafra_ceo());

DROP POLICY IF EXISTS "ui_event_logs_actor_insert" ON public.ui_event_logs;
CREATE POLICY "ui_event_logs_actor_insert" ON public.ui_event_logs FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

CREATE TABLE IF NOT EXISTS public.session_login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_role public.rol_usuario,
  session_key TEXT NOT NULL,
  platform TEXT,
  app_version TEXT,
  device_label TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  estado_ve TEXT,
  municipio TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT session_login_logs_actor_session_unique UNIQUE (actor_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_session_login_logs_actor_created
  ON public.session_login_logs(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_login_logs_role_created
  ON public.session_login_logs(actor_role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_login_logs_session_created
  ON public.session_login_logs(session_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_login_logs_created
  ON public.session_login_logs(created_at DESC);

ALTER TABLE public.session_login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_login_logs_actor_select" ON public.session_login_logs;
CREATE POLICY "session_login_logs_actor_select" ON public.session_login_logs FOR SELECT
  USING (auth.uid() = actor_id);

DROP POLICY IF EXISTS "session_login_logs_ceo_select" ON public.session_login_logs;
CREATE POLICY "session_login_logs_ceo_select" ON public.session_login_logs FOR SELECT
  USING (public.is_zafra_ceo());

DROP POLICY IF EXISTS "session_login_logs_actor_insert" ON public.session_login_logs;
CREATE POLICY "session_login_logs_actor_insert" ON public.session_login_logs FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

CREATE OR REPLACE FUNCTION public.ceo_observability_summary(p_window_hours INTEGER DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours INTEGER := GREATEST(COALESCE(p_window_hours, 24), 1);
  v_since TIMESTAMPTZ := NOW() - make_interval(hours => v_hours);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_zafra_ceo() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  RETURN jsonb_build_object(
    'events_total',
    COALESCE((SELECT COUNT(*) FROM public.ui_event_logs WHERE created_at >= v_since), 0),
    'unique_users',
    COALESCE((SELECT COUNT(DISTINCT actor_id) FROM public.ui_event_logs WHERE created_at >= v_since), 0),
    'login_count',
    COALESCE((SELECT COUNT(*) FROM public.session_login_logs WHERE created_at >= v_since), 0),
    'ui_errors',
    COALESCE((SELECT COUNT(*) FROM public.ui_event_logs WHERE created_at >= v_since AND event_type = 'error_ui'), 0),
    'top_screens',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('screen', ranked.screen, 'total', ranked.total)
        ORDER BY ranked.total DESC, ranked.screen
      )
      FROM (
        SELECT COALESCE(screen, 'Sin pantalla') AS screen, COUNT(*) AS total
        FROM public.ui_event_logs
        WHERE created_at >= v_since
        GROUP BY 1
        ORDER BY total DESC, screen
        LIMIT 5
      ) AS ranked
    ), '[]'::jsonb),
    'roles',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('role', ranked.actor_role, 'total', ranked.total)
        ORDER BY ranked.total DESC, ranked.actor_role
      )
      FROM (
        SELECT COALESCE(actor_role::TEXT, 'desconocido') AS actor_role, COUNT(*) AS total
        FROM public.ui_event_logs
        WHERE created_at >= v_since
        GROUP BY 1
        ORDER BY total DESC, actor_role
        LIMIT 7
      ) AS ranked
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ceo_observability_summary(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ceo_observability_summary(INTEGER) TO authenticated;
