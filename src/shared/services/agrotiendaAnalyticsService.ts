import { supabase } from '@/shared/lib/supabase';

export interface VentasMes {
  mes: string;   // 'YYYY-MM'
  total: number;
}

export interface ProductoConsultado {
  insumo_id:       string;
  nombre_producto: string;
  categoria:       string;
  total_consultas: number;
  ventas:          number;
}

export async function getVentasPorMes(vendedorId: string): Promise<VentasMes[]> {
  const { data, error } = await supabase.rpc('agrotienda_ventas_por_mes', {
    p_vendedor_id: vendedorId,
  });
  if (error) throw error;
  return (data as VentasMes[]) ?? [];
}

export async function getProductosMasConsultados(
  vendedorId: string,
  limit = 5,
): Promise<ProductoConsultado[]> {
  const { data, error } = await supabase.rpc('agrotienda_productos_mas_consultados', {
    p_vendedor_id: vendedorId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as ProductoConsultado[]) ?? [];
}
