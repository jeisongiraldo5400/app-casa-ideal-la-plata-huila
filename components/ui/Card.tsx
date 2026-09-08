import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'elevated' | 'outlined' | 'muted';
}

export function Card({ children, style, variant = 'elevated' }: CardProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor:
            variant === 'muted' ? colors.surface.muted : colors.background.paper,
          borderColor: colors.divider,
        },
        variant === 'outlined' && styles.outlined,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.xl,
    ...Shadows.card,
    borderWidth: 1,
  },
  outlined: {
    elevation: 0,
    shadowOpacity: 0,
  },
});
