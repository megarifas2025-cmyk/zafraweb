-- Función RPC que devuelve todas las métricas del CEO en UNA sola llamada.
-- Reemplaza las 14 queries paralelas por 1 función con SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.get_ceo_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users     bigint := 0;
  v_pending_kyc     bigint := 0;
  v_blocked_users   bigint := 0;
  v_companies       bigint := 0;
  v_peritos         bigint := 0;
  v_active_freight  bigint := 0;
  v_agrotiendas     bigint := 0;
  -- role counts
  v_ceo             bigint := 0;
  v_company_r       bigint := 0;
  v_perito_r        bigint := 0;
  v_producer        bigint := 0;
  v_buyer           bigint := 0;
  v_transporter     bigint := 0;
  v_agrotienda_r    bigint := 0;
BEGIN
  -- Verificar que el llamante es zafra_ceo
  IF NOT is_zafra_ceo() THEN
    RAISE EXCEPTION 'Acceso denegado';
  END IF;

  -- Métricas generales (recorre perfiles UNA vez con CASE)
  SELECT
    COUNT(*)                                              INTO v_total_users
  FROM public.perfiles;

  SELECT
    COUNT(*) FILTER (WHERE kyc_estado <> 'verified')    INTO v_pending_kyc
  FROM public.perfiles;

  SELECT
    COUNT(*) FILTER (WHERE bloqueado = true)             INTO v_blocked_users
  FROM public.perfiles;

  -- Conteos por rol en UN solo pass
  SELECT
    COUNT(*) FILTER (WHERE rol = 'zafra_ceo'),
    COUNT(*) FILTER (WHERE rol = 'company'),
    COUNT(*) FILTER (WHERE rol = 'perito'),
    COUNT(*) FILTER (WHERE rol = 'independent_producer'),
    COUNT(*) FILTER (WHERE rol = 'buyer'),
    COUNT(*) FILTER (WHERE rol = 'transporter'),
    COUNT(*) FILTER (WHERE rol = 'agrotienda')
  INTO
    v_ceo, v_company_r, v_perito_r,
    v_producer, v_buyer, v_transporter, v_agrotienda_r
  FROM public.perfiles;

  v_agrotiendas := v_agrotienda_r;

  -- Companies activas
  SELECT COUNT(*) INTO v_companies FROM public.companies;

  -- Peritos activos
  SELECT COUNT(*) INTO v_peritos FROM public.peritos WHERE activo = true;

  -- Fletes activos
  SELECT COUNT(*) INTO v_active_freight
  FROM public.freight_requests
  WHERE estado IN ('abierta', 'con_postulaciones', 'asignada');

  RETURN jsonb_build_object(
    'totalUsers',    v_total_users,
    'pendingKyc',    v_pending_kyc,
    'blockedUsers',  v_blocked_users,
    'companies',     v_companies,
    'peritos',       v_peritos,
    'activeFreight', v_active_freight,
    'agrotiendas',   v_agrotiendas,
    'roleCounts', jsonb_build_array(
      jsonb_build_object('rol', 'zafra_ceo',             'total', v_ceo),
      jsonb_build_object('rol', 'company',               'total', v_company_r),
      jsonb_build_object('rol', 'perito',                'total', v_perito_r),
      jsonb_build_object('rol', 'independent_producer',  'total', v_producer),
      jsonb_build_object('rol', 'buyer',                 'total', v_buyer),
      jsonb_build_object('rol', 'transporter',           'total', v_transporter),
      jsonb_build_object('rol', 'agrotienda',            'total', v_agrotienda_r)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ceo_dashboard_metrics() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ceo_dashboard_metrics() FROM anon;
