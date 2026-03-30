import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '@/shared/utils/theme';
import type { CompanyStackParamList } from './types';
import CompanyDashboard from '../screens/CompanyDashboard';
import RegisteredFarmsList from '../screens/RegisteredFarmsList';
import ActiveHarvestsList from '../screens/ActiveHarvestsList';
import CompanyEmployeesList from '../screens/CompanyEmployeesList';
import AffiliatedTransportersList from '../screens/AffiliatedTransportersList';
import AffiliatedFarmersList from '../screens/AffiliatedFarmersList';
import FleetManagement from '../screens/FleetManagement';
import AnalyticsDashboard from '../screens/AnalyticsDashboard';
import SharedProducerProfileScreen from '@/shared/screens/SharedProducerProfileScreen';

const Stack = createNativeStackNavigator<CompanyStackParamList>();

export default function CompanyStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="CompanyHome" component={CompanyDashboard} options={{ headerShown: false }} />
      <Stack.Screen name="RegisteredFarmsList" component={RegisteredFarmsList} options={{ title: 'Fincas registradas' }} />
      <Stack.Screen name="ActiveHarvestsList" component={ActiveHarvestsList} options={{ title: 'Cosechas activas' }} />
      <Stack.Screen name="CompanyEmployeesList" component={CompanyEmployeesList} options={{ title: 'Peritos / Agrónomos' }} />
      <Stack.Screen name="AffiliatedTransportersList" component={AffiliatedTransportersList} options={{ title: 'Transportistas' }} />
      <Stack.Screen name="AffiliatedFarmersList" component={AffiliatedFarmersList} options={{ title: 'Cartera de productores' }} />
      <Stack.Screen name="FleetManagement" component={FleetManagement} options={{ title: 'Flota propia' }} />
      <Stack.Screen name="AnalyticsDashboard" component={AnalyticsDashboard} options={{ title: 'Reportes' }} />
      <Stack.Screen name="SharedProducerProfile" component={SharedProducerProfileScreen} options={{ title: 'Perfil del productor' }} />
    </Stack.Navigator>
  );
}
