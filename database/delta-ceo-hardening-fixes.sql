-- Endurecimiento final del rol zafra_ceo:
-- 1) reportes de chat solo por participantes reales
-- 2) severidad manual acotada por categoría
-- 3) modo auditor deja rastro también en admin_audit_logs
-- 4) lectura CEO sobre peritos para métricas ejecutivas

CREATE OR REPLACE FUNCTION public.report_chat_incident(
  p_source text,
  p_sala_id uuid DEFAULT NULL,
  p_logistics_sala_id uuid DEFAULT NULL,
  p_offender_id uuid DEFAULT NULL,
  p_category text DEFAULT 'manual_report',
  p_severity text DEFAULT 'media',
  p_reason text DEFAULT NULL,
  p_message_excerpt text DEFAULT NULL,
  p_auto_detected boolean DEFAULT FALSE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_market public.salas_chat%ROWTYPE;
  v_logistics public.logistics_salas%ROWTYPE;
  v_final_severity text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;

  IF p_source NOT IN ('market', 'logistics') THEN
    RAISE EXCEPTION 'Fuente de incidente inválida.';
  END IF;

  IF p_source = 'market' THEN
    IF p_sala_id IS NULL OR p_logistics_sala_id IS NOT NULL THEN
      RAISE EXCEPTION 'Referencia de chat comercial inválida.';
    END IF;
    SELECT * INTO v_market FROM public.salas_chat WHERE id = p_sala_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La sala comercial no existe.';
    END IF;
    IF auth.uid() NOT IN (v_market.comprador_id, v_market.agricultor_id) THEN
      RAISE EXCEPTION 'Solo los participantes pueden reportar este chat comercial.';
    END IF;
    IF p_offender_id IS NOT NULL AND p_offender_id NOT IN (v_market.comprador_id, v_market.agricultor_id) THEN
      RAISE EXCEPTION 'El usuario reportado no pertenece a este chat comercial.';
    END IF;
  ELSE
    IF p_logistics_sala_id IS NULL OR p_sala_id IS NOT NULL THEN
      RAISE EXCEPTION 'Referencia de chat logístico inválida.';
    END IF;
    SELECT * INTO v_logistics FROM public.logistics_salas WHERE id = p_logistics_sala_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La sala logística no existe.';
    END IF;
    IF auth.uid() NOT IN (v_logistics.requester_id, v_logistics.transportista_id) THEN
      RAISE EXCEPTION 'Solo los participantes pueden reportar este chat logístico.';
    END IF;
    IF p_offender_id IS NOT NULL AND p_offender_id NOT IN (v_logistics.requester_id, v_logistics.transportista_id) THEN
      RAISE EXCEPTION 'El usuario reportado no pertenece a este chat logístico.';
    END IF;
  END IF;

  v_final_severity := CASE
    WHEN p_category IN ('fraud_attempt', 'threat', 'fake_document') THEN
      CASE WHEN p_severity IN ('alta', 'critica') THEN p_severity ELSE 'alta' END
    WHEN p_category = 'unsafe_payment' THEN
      CASE WHEN p_severity IN ('alta', 'critica') THEN p_severity ELSE 'alta' END
    ELSE
      'media'
  END;

  INSERT INTO public.chat_incidents (
    source,
    sala_id,
    logistics_sala_id,
    reported_by,
    offender_id,
    category,
    severity,
    reason,
    message_excerpt,
    auto_detected,
    status
  )
  VALUES (
    p_source,
    p_sala_id,
    p_logistics_sala_id,
    auth.uid(),
    p_offender_id,
    p_category,
    v_final_severity,
    p_reason,
    p_message_excerpt,
    p_auto_detected,
    'open'
  )
  RETURNING id INTO v_id;

  PERFORM public.notify_zafra_ceo_chat_alert(
    'Nuevo reporte de chat',
    format('Se registró un incidente manual en un chat %s.', p_source)
  );

  RETURN v_id;
END;
$$;

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

  INSERT INTO public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    target_table,
    target_id,
    target_label,
    reason,
    details
  )
  VALUES (
    auth.uid(),
    'zafra_ceo'::rol_usuario,
    'open_chat_audit',
    'chat_incidents',
    v_incident.id,
    v_incident.category,
    'Apertura de conversación en modo auditor',
    jsonb_build_object(
      'source', v_incident.source,
      'severity', v_incident.severity,
      'sala_id', v_incident.sala_id,
      'logistics_sala_id', v_incident.logistics_sala_id
    )
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

DROP POLICY IF EXISTS "perito_zafra_ceo" ON public.peritos;
CREATE POLICY "perito_zafra_ceo" ON public.peritos FOR ALL
  USING (public.is_zafra_ceo())
  WITH CHECK (public.is_zafra_ceo());
