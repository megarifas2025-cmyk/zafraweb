export type CompanyStackParamList = {
  CompanyHome: undefined;
  RegisteredFarmsList: undefined;
  ActiveHarvestsList: undefined;
  CompanyEmployeesList: undefined;
  AffiliatedTransportersList: undefined;
  AffiliatedFarmersList: undefined;
  FleetManagement: undefined;
  AnalyticsDashboard: undefined;
  SharedProducerProfile: {
    producerId: string;
    producerName?: string;
    accessContext?: 'company_view' | 'buyer_view' | 'read_only' | 'owner' | 'zafra_ceo_view';
  };
};

/** Pestaña Perfil: mismo aspecto que otros roles + formulario de empresa aparte. */
export type CompanyProfileTabParamList = {
  CompanyPerfilMain: undefined;
  CompanyProfileSettingsForm: undefined;
};
