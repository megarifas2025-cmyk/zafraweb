import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/shared/store/AuthContext';
import { supabase } from '@/shared/lib/supabase';

export interface CompanyRow {
  id: string;
  perfil_id: string;
  razon_social: string;
  rif: string;
  logo_url: string;
  direccion: string | null;
  direccion_fiscal: string;
  telefono_contacto: string;
  correo_contacto: string;
}

const FETCH_MS = 18_000;
const companyCache = new Map<string, CompanyRow>();

type CompaniesQueryResult = {
  data: CompanyRow | null;
  error: { message: string } | null;
};

export function useCompany() {
  const { perfil } = useAuth();
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!perfil?.id || perfil.rol !== 'company') {
      setCompany(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    const cached = companyCache.get(perfil.id) ?? null;
    if (cached) {
      setCompany(cached);
    }
    setLoading(true);
    setLoadError(null);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const query = supabase.from('companies').select('*').eq('perfil_id', perfil.id).maybeSingle();
      const result = await Promise.race<CompaniesQueryResult | '__timeout__'>([
        query as unknown as Promise<CompaniesQueryResult>,
        new Promise<'__timeout__'>((resolve) => {
          timeoutId = setTimeout(() => resolve('__timeout__'), FETCH_MS);
        }),
      ]);
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

      if (result === '__timeout__') {
        if (!cached && mountedRef.current) {
          setCompany(null);
          setLoadError('Tiempo de espera agotado. Revisa la conexión e intenta de nuevo.');
        }
        void Promise.resolve(query)
          .then((lateResult) => {
            if (!mountedRef.current) return;
            if (lateResult.error || !lateResult.data) return;
            companyCache.set(perfil.id, lateResult.data);
            setCompany(lateResult.data);
            setLoadError(null);
            setLoading(false);
          })
          .catch(() => undefined);
        return;
      }
      const { data, error } = result;
      if (!mountedRef.current) return;
      if (error) {
        if (!cached) setCompany(null);
        setLoadError(error.message);
        return;
      }
      if (data) {
        companyCache.set(perfil.id, data);
        setCompany(data);
      } else {
        if (!cached) setCompany(null);
        setLoadError('No hay fila en companies para tu cuenta. Completa el registro de empresa o contacta soporte.');
      }
    } catch (e: unknown) {
      if (timeoutId) { clearTimeout(timeoutId); }
      if (!mountedRef.current) return;
      if (!cached) setCompany(null);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [perfil?.id, perfil?.rol]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { company, loading, loadError, refresh };
}
