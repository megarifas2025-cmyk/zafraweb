import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import CompanyPerfilScreen from '../screens/CompanyPerfilScreen';
import CompanyProfileSettings from '../screens/CompanyProfileSettings';
import type { CompanyProfileTabParamList } from './types';
import { COLORS } from '@/shared/utils/theme';

const Stack = createNativeStackNavigator<CompanyProfileTabParamList>();

type PerfilMainProps = NativeStackScreenProps<CompanyProfileTabParamList, 'CompanyPerfilMain'>;

function CompanyPerfilMainScreen({ navigation }: PerfilMainProps) {
  return <CompanyPerfilScreen onDatosEmpresa={() => navigation.navigate('CompanyProfileSettingsForm')} />;
}

export default function CompanyProfileTabStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.roles.company },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="CompanyPerfilMain"
        component={CompanyPerfilMainScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CompanyProfileSettingsForm"
        component={CompanyProfileSettings}
        options={{ title: 'Datos de empresa' }}
      />
    </Stack.Navigator>
  );
}
