import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { COLORS } from '@/shared/utils/theme';
import type { SuperAdminStackParamList } from './types';
import SuperAdminDashboard from '../screens/SuperAdminDashboard';
import CeoUsersOverviewScreen from '../screens/CeoUsersOverviewScreen';
import CeoGlobalActivityScreen from '../screens/CeoGlobalActivityScreen';
import CeoAccessSessionsScreen from '../screens/CeoAccessSessionsScreen';
import CeoFreightSupervisionScreen from '../screens/CeoFreightSupervisionScreen';
import CreatePeritoAccountScreen from '../screens/CreatePeritoAccountScreen';
import CeoGovernanceScreen from '../screens/CeoGovernanceScreen';
import CeoAuditTrailScreen from '../screens/CeoAuditTrailScreen';
import CeoSystemReportScreen from '../screens/CeoSystemReportScreen';
import CeoChatIncidentsScreen from '../screens/CeoChatIncidentsScreen';
import CeoChatAuditScreen from '../screens/CeoChatAuditScreen';
import SharedProducerProfileScreen from '@/shared/screens/SharedProducerProfileScreen';

const Stack = createNativeStackNavigator<SuperAdminStackParamList>();

export default function SuperAdminStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.roles.zafra_ceo },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="SuperAdminHome" component={SuperAdminDashboard} options={{ headerShown: false }} />
      <Stack.Screen name="CeoUsersOverview" component={CeoUsersOverviewScreen} options={{ title: 'Centro de usuarios' }} />
      <Stack.Screen name="CeoGlobalActivity" component={CeoGlobalActivityScreen} options={{ title: 'Actividad global' }} />
      <Stack.Screen name="CeoAccessSessions" component={CeoAccessSessionsScreen} options={{ title: 'Sesiones y acceso' }} />
      <Stack.Screen name="CeoFreightSupervision" component={CeoFreightSupervisionScreen} options={{ title: 'Supervisión de cargas' }} />
      <Stack.Screen
        name="CreatePeritoAccount"
        component={CreatePeritoAccountScreen}
        options={{ title: 'Crear cuenta perito' }}
      />
      <Stack.Screen name="CeoGovernance" component={CeoGovernanceScreen} options={{ title: 'Gobierno de usuarios' }} />
      <Stack.Screen name="CeoAuditTrail" component={CeoAuditTrailScreen} options={{ title: 'Bitácora ejecutiva' }} />
      <Stack.Screen name="CeoSystemReport" component={CeoSystemReportScreen} options={{ title: 'Reporte del sistema' }} />
      <Stack.Screen name="CeoChatIncidents" component={CeoChatIncidentsScreen} options={{ title: 'Incidentes de chat' }} />
      <Stack.Screen name="CeoChatAudit" component={CeoChatAuditScreen} options={{ title: 'Modo auditor' }} />
      <Stack.Screen
        name="SharedProducerProfile"
        component={SharedProducerProfileScreen}
        options={{ title: 'Perfil del productor' }}
      />
    </Stack.Navigator>
  );
}
