import { useThemeStore } from '../store/themeStore';

export function useTheme() {
  const themeMode = useThemeStore((state) => state.themeMode);
  const isDark = useThemeStore((state) => state.isDark);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const initializeTheme = useThemeStore((state) => state.initializeTheme);

  return {
    themeMode,
    isDark,
    setThemeMode,
    initializeTheme,
  };
}



