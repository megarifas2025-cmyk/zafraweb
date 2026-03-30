import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '@/shared/utils/theme';
import type { PeritoStackParamList } from './types';
import PeritoDashboard from '../screens/PeritoDashboard';
import FieldInspectionDetailScreen from '../screens/FieldInspectionDetailScreen';
import InspectionFormScreen from '../screens/InspectionFormScreen';

const Stack = createNativeStackNavigator<PeritoStackParamList>();

export default function PeritoStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.roles.perito },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="PeritoHome" component={PeritoDashboard} options={{ headerShown: false }} />
      <Stack.Screen
        name="FieldInspectionDetail"
        component={FieldInspectionDetailScreen}
        options={{ title: 'Orden de campo' }}
      />
      <Stack.Screen
        name="InspectionForm"
        component={InspectionFormScreen}
        options={{ title: 'Formulario de inspección' }}
      />
    </Stack.Navigator>
  );
}
