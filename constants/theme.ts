/**
 * Theme configuration for the app
 */

import { Platform } from 'react-native';

export const Colors = {
  primary: {
    main: '#3b82f6', // Azul moderno
    light: '#60a5fa',
    dark: '#1d4ed8',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#6366f1', // Índigo
    light: '#818cf8',
    dark: '#4f46e5',
    contrastText: '#ffffff',
  },
  background: {
    default: '#fafbfc', // Gris muy claro
    paper: '#ffffff', // Blanco puro
  },
  text: {
    primary: '#1f2937', // Gris oscuro
    secondary: '#6b7280', // Gris medio
  },
  divider: '#e5e7eb', // Gris claro
  success: {
    main: '#22c55e', // Verde moderno
    light: '#4ade80',
    dark: '#16a34a',
  },
  warning: {
    main: '#f59e0b', // Amarillo/naranja
    light: '#fbbf24',
    dark: '#d97706',
  },
  error: {
    main: '#ef4444', // Rojo moderno
    light: '#f87171',
    dark: '#dc2626',
  },
  info: {
    main: '#3b82f6', // Azul info
    light: '#60a5fa',
    dark: '#1d4ed8',
  },
};

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
