import type { ExitMode } from '@/components/exits/infrastructure/store/exitsStore';

/** Minimal theme slice used by exit picker fields */
export type ThemeColors = {
  background: { paper: string };
  divider: string;
  text: { primary: string };
};

export type ExitModePickerFieldProps = {
  exitMode: ExitMode | null;
  onExitModeChange: (mode: ExitMode | null) => void;
  colors: ThemeColors;
  /** Reservado para ajustes de tema en iOS (Modal / futuro) */
  colorScheme: 'light' | 'dark';
};

export type ExitUserOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type UserSelectFieldProps = {
  users: ExitUserOption[];
  selectedUserId: string | null;
  onUserChange: (userId: string | null) => void;
  colors: ThemeColors;
  /** Reservado para ajustes de tema en iOS (Modal / futuro) */
  colorScheme: 'light' | 'dark';
};
