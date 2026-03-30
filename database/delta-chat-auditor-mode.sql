-- Modo auditor para zafra_ceo:
-- acceso solo a incidentes de chat severidad alta/critica
-- cada apertura deja rastro en chat_audit_access_logs

CREATE TABLE IF NOT EXISTS public.chat_audit_access_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       UUID NOT NULL REFERENCES public.chat_incidents(id) ON DELETE CASCADE,
  actor_id          UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  source            TEXT NOT NULL CHECK (source IN ('market', 'logistics')),
  sala_id           UUID REFERENCES public.salas_chat(id) ON DELETE CASCADE,
  logistics_sala_id UUID REFERENCES public.logistics_salas(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_audit_access_logs_incident ON public.chat_audit_access_logs(incident_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.ceo_get_chat_audit_messages(p_incident_id uuid)
RETURNS TABLE (
  id uuid,
  incident_id uuid,
  source text,
  chat_id uuid,
  author_id uuid,
  author_name text,
  contenido text,
  tipo text,
  media_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident public.chat_incidents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_zafra_ceo() THEN
    RAISE EXCEPTION 'Solo el CEO puede usar modo auditor.';
  END IF;

  SELECT *
  INTO v_incident
  FROM public.chat_incidents
  WHERE id = p_incident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incidente no encontrado.';
  END IF;

  IF v_incident.severity NOT IN ('alta', 'critica') THEN
    RAISE EXCEPTION 'Modo auditor disponible solo para incidentes de severidad alta o crítica.';
  END IF;

  INSERT INTO public.chat_audit_access_logs (
    incident_id,
    actor_id,
    source,
    sala_id,
    logistics_sala_id
  )
  VALUES (
    v_incident.id,
    auth.uid(),
    v_incident.source,
    v_incident.sala_id,
    v_incident.logistics_sala_id
  );

  IF v_incident.source = 'market' THEN
    RETURN QUERY
    SELECT
      m.id,
      v_incident.id,
      'market'::text,
      m.sala_id,
      m.autor_id,
      p.nombre,
      m.contenido,
      m.tipo,
      m.media_url,
      m.creado_en
    FROM public.mensajes m
    LEFT JOIN public.perfiles p ON p.id = m.autor_id
    WHERE m.sala_id = v_incident.sala_id
    ORDER BY m.creado_en ASC;
  ELSE
    RETURN QUERY
    SELECT
      m.id,
      v_incident.id,
      'logistics'::text,
      m.sala_id,
      m.autor_id,
      p.nombre,
      m.contenido,
      m.tipo,
      m.media_url,
      m.creado_en
    FROM public.logistics_mensajes m
    LEFT JOIN public.perfiles p ON p.id = m.autor_id
    WHERE m.sala_id = v_incident.logistics_sala_id
    ORDER BY m.creado_en ASC;
  END IF;
END;
$$;

ALTER TABLE public.chat_audit_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_audit_logs_zafra_ceo_select" ON public.chat_audit_access_logs;
CREATE POLICY "chat_audit_logs_zafra_ceo_select" ON public.chat_audit_access_logs FOR SELECT
  USING (public.is_zafra_ceo());

REVOKE ALL ON FUNCTION public.ceo_get_chat_audit_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ceo_get_chat_audit_messages(uuid) TO authenticated;
