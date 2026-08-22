import { useTheme } from '@/components/theme';
import { Radius, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  backgroundColor?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color,
  backgroundColor,
  size = 22,
  style,
}: IconButtonProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: backgroundColor ?? colors.background.paper, borderColor: colors.divider },
        pressed && styles.pressed,
        style,
      ]}>
      <MaterialIcons name={icon} size={size} color={color ?? colors.text.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
