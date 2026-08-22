/**
 * Theme configuration for the app
 */

import { Platform } from 'react-native';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  control: 12,
  card: 18,
  panel: 24,
  pill: 999,
} as const;

export const Typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  section: { fontSize: 19, lineHeight: 24, fontWeight: '800' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '700' as const },
  metadata: { fontSize: 12, lineHeight: 17, fontWeight: '500' as const },
} as const;

export const Shadows = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  floating: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
} as const;

const lightColors = {
  primary: {
    main: '#1e3a8a', // Azul oscuro - Color principal (logo)
    light: '#60a5fa', // Azul claro - Acentos
    dark: '#3b82f6', // Azul medio - Secundario, hover
    contrastText: '#ffffff', // Blanco
  },
  secondary: {
    main: '#3b82f6', // Azul medio - Secundario, hover
    light: '#60a5fa', // Azul claro - Acentos
    dark: '#1e3a8a', // Azul oscuro - Color principal
    contrastText: '#ffffff', // Blanco
  },
  background: {
    default: '#f7f5f1', // papel cálido
    paper: '#ffffff', // Blanco - Fondos, papel
  },
  surface: {
    elevated: '#ffffff',
    muted: '#eef2ff',
    sunken: '#eeece7',
  },
  navigation: {
    background: '#1f2937',
    active: '#60a5fa',
    inactive: '#d1d5db',
  },
  text: {
    primary: '#1f2937', // Gris oscuro - Texto principal
    secondary: '#6b7280', // Gris medio - Texto secundario
  },
  divider: '#e5e7eb', // Gris claro - Divisores, bordes
  success: {
    main: '#22c55e', // Verde - Éxito
    light: '#4ade80',
    dark: '#16a34a',
  },
  warning: {
    main: '#f59e0b', // Amarillo - Advertencia
    light: '#fbbf24',
    dark: '#d97706',
  },
  error: {
    main: '#dc2626', // Rojo - Errores, logo
    light: '#ef4444',
    dark: '#b91c1c',
  },
  info: {
    main: '#3b82f6', // Azul medio - Info
    light: '#60a5fa', // Azul claro
    dark: '#1e3a8a', // Azul oscuro
  },
};

const darkColors = {
  primary: {
    main: '#3b82f6', // Azul medio - Más claro en modo oscuro
    light: '#60a5fa', // Azul claro
    dark: '#1e3a8a', // Azul oscuro
    contrastText: '#ffffff', // Blanco
  },
  secondary: {
    main: '#60a5fa', // Azul claro
    light: '#93c5fd', // Azul más claro
    dark: '#3b82f6', // Azul medio
    contrastText: '#ffffff', // Blanco
  },
  background: {
    default: '#111827', // Gris muy oscuro - Fondo default
    paper: '#1f2937', // Gris oscuro - Fondos, papel
  },
  surface: {
    elevated: '#273449',
    muted: '#1e3a5f',
    sunken: '#0b1220',
  },
  navigation: {
    background: '#0b1220',
    active: '#60a5fa',
    inactive: '#cbd5e1',
  },
  text: {
    primary: '#f9fafb', // Casi blanco - Texto principal
    secondary: '#d1d5db', // Gris claro - Texto secundario
  },
  divider: '#374151', // Gris medio oscuro - Divisores, bordes
  success: {
    main: '#22c55e', // Verde - Éxito (mismo)
    light: '#4ade80',
    dark: '#16a34a',
  },
  warning: {
    main: '#f59e0b', // Amarillo - Advertencia (mismo)
    light: '#fbbf24',
    dark: '#d97706',
  },
  error: {
    main: '#ef4444', // Rojo más claro en modo oscuro
    light: '#f87171',
    dark: '#dc2626',
  },
  info: {
    main: '#60a5fa', // Azul claro
    light: '#93c5fd', // Azul más claro
    dark: '#3b82f6', // Azul medio
  },
};

// Función para obtener los colores según el tema
export const getColors = (isDark: boolean) => {
  return isDark ? darkColors : lightColors;
};

export type ThemeColors = ReturnType<typeof getColors>;

export type ThemeTokens = {
  colors: ThemeColors;
  spacing: typeof Spacing;
  radius: typeof Radius;
  typography: typeof Typography;
  shadows: typeof Shadows;
};

export const getThemeTokens = (isDark: boolean): ThemeTokens => ({
  colors: getColors(isDark),
  spacing: Spacing,
  radius: Radius,
  typography: Typography,
  shadows: Shadows,
});

// Exportar colores por defecto (modo claro) para compatibilidad
export const Colors = lightColors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
