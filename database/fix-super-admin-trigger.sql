-- Desactiva el auto-ascenso de zafra_ceo por email.
-- Ejecuta este parche si un entorno antiguo todavía conserva `trg_auto_zafra_ceo`.

DROP TRIGGER IF EXISTS trg_auto_zafra_ceo ON public.perfiles;
DROP FUNCTION IF EXISTS public.fn_auto_zafra_ceo();
DROP FUNCTION IF EXISTS fn_auto_zafra_ceo();
