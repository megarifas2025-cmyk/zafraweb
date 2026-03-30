export const COLORS = {
  primary:   '#1B4332',
  primary2:  '#2D6A4F',
  accent:    '#F4A261',
  accentAlt: '#E9C46A',
  success:   '#2E7D32',
  warning:   '#F57C00',
  danger:    '#C62828',
  error:     '#C62828',
  info:      '#1565C0',
  roles: {
    zafra_ceo:         '#37474F',
    company:             '#1B4332',
    perito:              '#2D6A4F',
    independent_producer:'#388E3C',
    buyer:               '#1565C0',
    transporter:         '#3B82F6',
    agrotienda:          '#6A1B9A',
  },
  kyc: {
    pendiente:   '#9E9E9E',
    en_revision: '#F57C00',
    verified:    '#2E7D32',
    rechazado:   '#C62828',
    bloqueado:   '#B71C1C',
  },
  alertaWaze: {
    verificada:    '#C62828',
    no_verificada: '#F57C00',
  },
  background: '#F8F5F0',
  surface:    '#FFFFFF',
  surfaceAlt: '#F1EDE5',
  border:     '#DDD5C8',
  divider:    '#EDE8E0',
  text:          '#1A1A1A',
  textSecondary: '#5C5C5C',
  textDisabled:  '#AFAFAF',
  textInverse:   '#FFFFFF',
};

export const FONT = {
  sizes: { xs: 10, sm: 12, md: 14, lg: 16, xl: 18, xxl: 22, hero: 28 },
  weights: { regular: '400' as const, medium: '500' as const, semibold: '600' as const, bold: '700' as const, heavy: '800' as const },
};

export const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const RADIUS = { sm: 6, md: 12, lg: 20, full: 999 };

export const SHADOW = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 14, elevation: 8 },
};
