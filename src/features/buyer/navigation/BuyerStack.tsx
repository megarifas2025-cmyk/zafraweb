import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '@/shared/utils/theme';
import type { BuyerStackParamList } from './BuyerStackParamList';
import BuyerDashboard from '../screens/BuyerDashboard';
import SharedProducerProfileScreen from '@/shared/screens/SharedProducerProfileScreen';

const Stack = createNativeStackNavigator<BuyerStackParamList>();

export default function BuyerStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { flex: 1, backgroundColor: '#FDFBF7' },
      }}
    >
      <Stack.Screen name="BuyerHome" component={BuyerDashboard} options={{ headerShown: false }} />
      <Stack.Screen
        name="SharedProducerProfile"
        component={SharedProducerProfileScreen}
        options={{ title: 'Perfil del productor' }}
      />
    </Stack.Navigator>
  );
}
