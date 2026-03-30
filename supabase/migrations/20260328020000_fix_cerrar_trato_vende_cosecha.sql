-- Fix cerrar_trato: marca la cosecha como 'vendida' al cerrar el trato
-- Antes solo actualizaba salas_chat.trato_cerrado pero la cosecha quedaba 'publicada'
-- en el mercado indefinidamente, permitiendo a otros compradores seguir negociando.

CREATE OR REPLACE FUNCTION public.cerrar_trato(
  p_sala  UUID,
  p_precio NUMERIC,
  p_moneda TEXT DEFAULT 'USD'
)
RETURNS TABLE(transportista_id UUID, nombre TEXT, distancia_km FLOAT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coords   GEOGRAPHY;
  v_cosecha  UUID;
BEGIN
  -- Solo un participante puede cerrar el trato
  UPDATE public.salas_chat
     SET trato_cerrado  = TRUE,
         precio_acordado = p_precio,
         moneda          = p_moneda
   WHERE id = p_sala
     AND (comprador_id = auth.uid() OR agricultor_id = auth.uid());

  -- Obtener el cosecha_id vinculado a esta sala
  SELECT cosecha_id INTO v_cosecha
    FROM public.salas_chat
   WHERE id = p_sala;

  -- Marcar la cosecha como vendida para que desaparezca del marketplace
  IF v_cosecha IS NOT NULL THEN
    UPDATE public.cosechas
       SET estado = 'vendida'
     WHERE id = v_cosecha
       AND estado IN ('publicada', 'negociando');
  END IF;

  -- Obtener coordenadas de carga para sugerir transportistas cercanos
  SELECT c.coord_carga INTO v_coords
    FROM public.salas_chat s
    JOIN public.cosechas   c ON c.id = s.cosecha_id
   WHERE s.id = p_sala;

  RETURN QUERY
    SELECT p.id,
           p.nombre,
           ST_Distance(v_coords, f.origen_coords)::FLOAT / 1000
      FROM public.fletes    f
      JOIN public.perfiles  p ON p.id = f.transportista_id
     WHERE f.estado         = 'available'
       AND p.kyc_estado     = 'verified'
       AND ST_DWithin(v_coords, f.origen_coords, 30000)
     ORDER BY ST_Distance(v_coords, f.origen_coords) ASC
     LIMIT 10;
END;
$$;

-- RPC para que el dueño de una máquina la marque como rentada desde el chat
CREATE OR REPLACE FUNCTION public.marcar_maquinaria_rentada(p_listing_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.machinery_rentals
     SET estatus = 'rented'
   WHERE id       = p_listing_id
     AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar esta maquinaria.';
  END IF;
END;
$$;
