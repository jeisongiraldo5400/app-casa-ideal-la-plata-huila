import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, ColorSchemeName } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  initializeTheme: () => Promise<void>;
  cleanup: () => void;
}

const THEME_STORAGE_KEY = '@casa_ideal_theme_mode';

let appearanceSub: { remove: () => void } | null = null;

function resolveIsDark(mode: ThemeMode, scheme: ColorSchemeName): boolean {
  if (mode === 'system') return scheme === 'dark';
  return mode === 'dark';
}

function bindSystemListener(set: (partial: Partial<ThemeState>) => void) {
  if (appearanceSub) {
    appearanceSub.remove();
    appearanceSub = null;
  }
  appearanceSub = Appearance.addChangeListener(({ colorScheme }) => {
    const { themeMode } = useThemeStore.getState();
    if (themeMode === 'system') {
      set({ isDark: resolveIsDark('system', colorScheme) });
    }
  });
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeMode: 'system',
  isDark: false,

  initializeTheme: async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      const themeMode = (savedTheme as ThemeMode) || 'system';
      const isDark = resolveIsDark(themeMode, Appearance.getColorScheme());
      set({ themeMode, isDark });
      if (themeMode === 'system') {
        bindSystemListener(set);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
      set({ themeMode: 'system', isDark: false });
      bindSystemListener(set);
    }
  },

  setThemeMode: async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      const isDark = resolveIsDark(mode, Appearance.getColorScheme());
      set({ themeMode: mode, isDark });
      if (mode === 'system') {
        bindSystemListener(set);
      } else if (appearanceSub) {
        appearanceSub.remove();
        appearanceSub = null;
      }
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  },

  cleanup: () => {
    if (appearanceSub) {
      appearanceSub.remove();
      appearanceSub = null;
    }
  },
}));
