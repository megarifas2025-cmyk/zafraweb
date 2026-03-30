import type { ProducerProfileAccessContext } from '@/shared/entities/producer-profile/producerProfileAccess';

export type ProducerStackParamList = {
  /** Desde FAB Scan en tab bar — abre flujo cámara / diagnóstico IA */
  ProducerHome: { openScan?: boolean } | undefined;
  PublicarCosecha: { kgPrefill?: string; notaProyeccion?: string } | undefined;
  MisFincas: undefined;
  DiarioCampo: undefined;
  MisInsumos: undefined;
  ComprarAgrotienda: undefined;
  Maquinaria: undefined;
  SharedProducerProfile: {
    producerId: string;
    producerName?: string;
    accessContext?: ProducerProfileAccessContext;
  };
};
