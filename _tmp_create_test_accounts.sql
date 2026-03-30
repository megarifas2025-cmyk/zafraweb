DO $$
DECLARE
  accounts jsonb := '[
    {"email":"agricultor@zafraclic.com",  "pass":"Test1234", "rol":"independent_producer", "nombre":"Carlos Productor",   "estado_ve":"Portuguesa"},
    {"email":"comprador@zafraclic.com",   "pass":"Test1234", "rol":"buyer",                "nombre":"Ana Compradora",     "estado_ve":"Carabobo"},
    {"email":"transporte@zafraclic.com",  "pass":"Test1234", "rol":"transporter",          "nombre":"Luis Transportista", "estado_ve":"Lara"},
    {"email":"perito@zafraclic.com",      "pass":"Test1234", "rol":"perito",               "nombre":"Pedro Inspector",    "estado_ve":"Aragua"},
    {"email":"tienda@zafraclic.com",      "pass":"Test1234", "rol":"agrotienda",           "nombre":"Tienda AgroTest",    "estado_ve":"Miranda"}
  ]';
  rec  jsonb;
  v_uid uuid;
  v_email text;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(accounts)
  LOOP
    v_email := rec->>'email';
    SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

    IF v_uid IS NULL THEN
      v_uid := gen_random_uuid();

      INSERT INTO auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, confirmation_token,
        email_change, email_change_token_new, recovery_token,
        created_at, updated_at
      ) VALUES (
        v_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        v_email,
        crypt(rec->>'pass', gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('rol', rec->>'rol', 'nombre', rec->>'nombre'),
        false, '', '', '', '',
        NOW(), NOW()
      );

      INSERT INTO auth.identities (
        id, user_id, provider_id, provider,
        identity_data, created_at, updated_at, last_sign_in_at
      ) VALUES (
        gen_random_uuid(), v_uid, v_email, 'email',
        jsonb_build_object('sub', v_uid::text, 'email', v_email,
                           'email_verified', true, 'provider_id', v_email),
        NOW(), NOW(), NOW()
      );

      RAISE NOTICE 'Creado: % (%)', v_email, rec->>'rol';
    ELSE
      UPDATE auth.users SET
        encrypted_password = crypt(rec->>'pass', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
      WHERE id = v_uid;
      RAISE NOTICE 'Ya existe, contraseña actualizada: %', v_email;
    END IF;

    INSERT INTO public.perfiles (
      id, rol, nombre, estado_ve, kyc_estado, activo, creado_en
    ) VALUES (
      v_uid,
      (rec->>'rol')::rol_usuario,
      rec->>'nombre',
      rec->>'estado_ve',
      'verified',
      true,
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      rol        = (rec->>'rol')::rol_usuario,
      kyc_estado = 'verified',
      activo     = true,
      nombre     = COALESCE(NULLIF(public.perfiles.nombre,''), rec->>'nombre');

    RAISE NOTICE 'Perfil listo: %', v_email;
  END LOOP;
END $$;
