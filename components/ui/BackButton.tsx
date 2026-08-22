import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

interface BackButtonProps {
  onPress?: () => void;
  color?: string;
  size?: number;
}

export function BackButton({ onPress, color, size = 24 }: BackButtonProps) {
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

  const iconColor = color || colors.text.primary;

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.button, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
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
});
