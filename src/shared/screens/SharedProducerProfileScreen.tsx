import React from 'react';
import { View, Text } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { SharedProducerProfile } from '@/shared/components/entities/SharedProducerProfile';
import type { ProducerProfileAccessContext } from '@/shared/entities/producer-profile/producerProfileAccess';

type RouteParams = {
  producerId: string;
  producerName?: string;
  accessContext?: ProducerProfileAccessContext;
};

/**
 * Pantalla contenedor: registra la ruta en el Stack y delega en SharedProducerProfile.
 */
export default function SharedProducerProfileScreen() {
  const route = useRoute();
  const params = (route.params ?? {}) as Partial<RouteParams>;

  if (!params.producerId) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#5C5C5C' }}>Perfil no disponible.</Text>
      </View>
    );
  }

  return (
    <SharedProducerProfile
      producerId={params.producerId}
      accessContext={params.accessContext}
    />
  );
}
