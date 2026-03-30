import React from 'react';
import { OportunidadesDemandaModal } from '@/shared/components/OportunidadesDemandaModal';
import { CATEGORIA_DESTINO_REQUERIMIENTO } from '@/shared/services/marketDemandService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Demandas de insumos / maquinaria — mismo modal que productor/empresa con filtro geográfico y chat. */
export function RequerimientosCompradoresModal({ visible, onClose }: Props) {
  return (
    <OportunidadesDemandaModal
      visible={visible}
      onClose={onClose}
      categoriaDestino={CATEGORIA_DESTINO_REQUERIMIENTO.insumosMaquinaria}
      title="Requerimientos de compradores"
      subtitle="Demanda de insumos, repuestos y maquinaria para tu agrotienda. No se muestran precios públicos: las condiciones se negocian dentro del chat."
      variant="agrotienda"
    />
  );
}
