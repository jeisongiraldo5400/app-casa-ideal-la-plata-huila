import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { getColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function Card({ children, style }: CardProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const Colors = getColors(colorScheme === 'dark');
  
  return (
    <View style={[
      styles.card,
      {
        backgroundColor: Colors.background.paper,
        borderColor: Colors.divider,
      },
      style
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
  },
});

