/**
 * Theme configuration for the app
 */

import { Platform } from 'react-native';

export const Colors = {
  primary: {
    main: '#6366f1', // Índigo vibrante y moderno
    light: '#818cf8',
    dark: '#4f46e5',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#8b5cf6', // Púrpura moderno
    light: '#a78bfa',
    dark: '#7c3aed',
    contrastText: '#ffffff',
  },
  background: {
    default: '#f8fafc', // Gris azulado muy suave
    paper: '#ffffff', // Blanco puro
  },
  text: {
    primary: '#0f172a', // Casi negro con tinte azul
    secondary: '#64748b', // Gris azulado medio
  },
  divider: '#e2e8f0', // Gris azulado claro
  success: {
    main: '#10b981', // Verde esmeralda moderno
    light: '#34d399',
    dark: '#059669',
  },
  warning: {
    main: '#f59e0b', // Ámbar moderno
    light: '#fbbf24',
    dark: '#d97706',
  },
  error: {
    main: '#ef4444', // Rojo coral moderno
    light: '#f87171',
    dark: '#dc2626',
  },
  info: {
    main: '#06b6d4', // Cyan moderno
    light: '#22d3ee',
    dark: '#0891b2',
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
