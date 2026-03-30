import type { ProducerProfileAccessContext } from '@/shared/entities/producer-profile/producerProfileAccess';

export type BuyerStackParamList = {
  BuyerHome: undefined;
  SharedProducerProfile: {
    producerId: string;
    producerName?: string;
    accessContext?: ProducerProfileAccessContext;
  };
};
