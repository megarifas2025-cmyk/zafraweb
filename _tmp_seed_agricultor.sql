DO $$
DECLARE
  v_uid  uuid;
  v_finca_id uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'agricultor@zafraclic.com';
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agricultor no existe aún'; END IF;

  -- Finca de prueba con coordenadas reales (Portuguesa, Venezuela)
  SELECT id INTO v_finca_id FROM public.fincas WHERE propietario_id = v_uid LIMIT 1;
  IF v_finca_id IS NULL THEN
    v_finca_id := gen_random_uuid();
    INSERT INTO public.fincas (
      id, propietario_id, nombre, municipio, estado_ve,
      hectareas, rubro, activa,
      coordenadas,
      creado_en
    ) VALUES (
      v_finca_id,
      v_uid,
      'Finca La Esperanza',
      'Guanare',
      'Portuguesa',
      25.5,
      'Maíz',
      true,
      ST_GeographyFromText('SRID=4326;POINT(-69.7478 9.0425)'),
      NOW()
    );
    RAISE NOTICE 'Finca creada: %', v_finca_id;
  ELSE
    -- Asegurarse de que tiene coordenadas
    UPDATE public.fincas
    SET coordenadas = COALESCE(coordenadas, ST_GeographyFromText('SRID=4326;POINT(-69.7478 9.0425)')),
        activa = true
    WHERE id = v_finca_id;
    RAISE NOTICE 'Finca ya existía: %', v_finca_id;
  END IF;

  -- Actualizar perfil con municipio y teléfono para que Perfil no quede vacío
  UPDATE public.perfiles SET
    municipio   = COALESCE(municipio, 'Guanare'),
    telefono    = COALESCE(telefono, '+58 412 0000001'),
    fecha_nacimiento = COALESCE(fecha_nacimiento, '1990-05-15')
  WHERE id = v_uid;

  RAISE NOTICE 'Agricultor seed completo para uid: %', v_uid;
END $$;
