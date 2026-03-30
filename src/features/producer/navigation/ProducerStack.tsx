import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '@/shared/utils/theme';
import type { ProducerStackParamList } from './types';
import ProducerDashboard from '../screens/ProducerDashboard';
import PublicarCosechaScreen from '../screens/PublicarCosechaScreen';
import MisFincasScreen from '../screens/MisFincasScreen';
import DiarioCampoScreen from '../screens/DiarioCampoScreen';
import MisInsumosScreen from '../screens/MisInsumosScreen';
import AgrotiendaMarketScreen from '../screens/AgrotiendaMarketScreen';
import MaquinariaScreen from '../screens/MaquinariaScreen';
import SharedProducerProfileScreen from '@/shared/screens/SharedProducerProfileScreen';

const Stack = createNativeStackNavigator<ProducerStackParamList>();

export default function ProducerStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { flex: 1, backgroundColor: '#FDFBF7' },
      }}
    >
      <Stack.Screen
        name="ProducerHome"
        component={ProducerDashboard}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PublicarCosecha"
        component={PublicarCosechaScreen}
        options={{ title: 'Publicar cosecha' }}
      />
      <Stack.Screen
        name="MisFincas"
        component={MisFincasScreen}
        options={{ title: 'Mis fincas' }}
      />
      <Stack.Screen
        name="DiarioCampo"
        component={DiarioCampoScreen}
        options={{ title: 'Diario de campo' }}
      />
      <Stack.Screen
        name="MisInsumos"
        component={MisInsumosScreen}
        options={{ title: 'Mis insumos' }}
      />
      <Stack.Screen
        name="ComprarAgrotienda"
        component={AgrotiendaMarketScreen}
        options={{ title: 'Comprar en agrotienda' }}
      />
      <Stack.Screen
        name="Maquinaria"
        component={MaquinariaScreen}
        options={{ title: 'Maquinaria' }}
      />
      <Stack.Screen
        name="SharedProducerProfile"
        component={SharedProducerProfileScreen}
        options={{ title: 'Perfil del productor' }}
      />
    </Stack.Navigator>
  );
}
