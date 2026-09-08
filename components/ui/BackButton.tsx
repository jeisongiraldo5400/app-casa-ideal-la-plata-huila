import { useTheme } from '@/components/theme';
import { Radius, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

interface BackButtonProps {
  onPress?: () => void;
  color?: string;
  size?: number;
  variant?: 'surface' | 'contrast';
  style?: StyleProp<ViewStyle>;
}

export function BackButton({ onPress, color, size = 24, variant = 'surface', style }: BackButtonProps) {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const isContrast = variant === 'contrast';
  const iconColor = color || (isContrast ? colors.onPrimary.text : colors.text.primary);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Volver"
      onPress={handlePress}
      style={[
        styles.button,
        isContrast
          ? { backgroundColor: colors.onPrimary.chipBg, borderColor: colors.onPrimary.border }
          : { backgroundColor: colors.background.paper, borderColor: colors.divider },
        style,
      ]}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MaterialIcons
        name="arrow-back"
        size={size}
        color={iconColor}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: Radius.control,
    borderWidth: 1,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
