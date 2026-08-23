import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
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
  const iconColor = color || (isContrast ? '#fff' : colors.text.primary);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[
        styles.button,
        isContrast
          ? styles.contrastButton
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
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contrastButton: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.32)',
  },
});
