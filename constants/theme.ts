/**
 * Theme configuration for the app
 */

import { Platform } from 'react-native';

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
    default: '#fafbfc', // Gris muy claro - Fondo default
    paper: '#ffffff', // Blanco - Fondos, papel
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
