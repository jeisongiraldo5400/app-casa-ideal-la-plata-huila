import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  initializeTheme: () => Promise<void>;
}

const THEME_STORAGE_KEY = '@casa_ideal_theme_mode';

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeMode: 'system',
  isDark: false,

  initializeTheme: async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      const themeMode = (savedTheme as ThemeMode) || 'system';
      
      // Si es 'system', detectar el tema del sistema
      let isDark = false;
      if (themeMode === 'system') {
        // En React Native, podemos usar el colorScheme del sistema
        // Por ahora, asumimos que el sistema está en modo claro por defecto
        // Esto se puede mejorar con expo-system-ui o react-native-appearance
        isDark = false;
      } else {
        isDark = themeMode === 'dark';
      }

      set({ themeMode, isDark });
    } catch (error) {
      console.error('Error loading theme:', error);
      set({ themeMode: 'system', isDark: false });
    }
  },

  setThemeMode: async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      
      let isDark = false;
      if (mode === 'system') {
        // Por ahora, asumimos modo claro
        isDark = false;
      } else {
        isDark = mode === 'dark';
      }

      set({ themeMode: mode, isDark });
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  },
}));


