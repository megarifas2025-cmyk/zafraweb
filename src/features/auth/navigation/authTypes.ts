import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ResetPassword: undefined;
  Kyc: undefined;
  App: undefined;
  BootWait: undefined;
};

export type AuthNav = NativeStackNavigationProp<AuthStackParamList>;
