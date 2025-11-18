import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors } from '@/constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: ButtonProps) {
  const getButtonStyle = () => {
    if (disabled || loading) {
      return [styles.button, styles.buttonDisabled, style];
    }
    switch (variant) {
      case 'primary':
        return [styles.button, styles.buttonPrimary, style];
      case 'secondary':
        return [styles.button, styles.buttonSecondary, style];
      case 'outline':
        return [styles.button, styles.buttonOutline, style];
      default:
        return [styles.button, styles.buttonPrimary, style];
    }
  };

  const getTextStyle = () => {
    if (disabled || loading) {
      return [styles.text, styles.textDisabled, textStyle];
    }
    switch (variant) {
      case 'primary':
        return [styles.text, styles.textPrimary, textStyle];
      case 'secondary':
        return [styles.text, styles.textSecondary, textStyle];
      case 'outline':
        return [styles.text, styles.textOutline, textStyle];
      default:
        return [styles.text, styles.textPrimary, textStyle];
    }
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}>
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' ? Colors.primary.main : Colors.primary.contrastText}
        />
      ) : (
        <Text style={getTextStyle()}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPrimary: {
    backgroundColor: Colors.primary.main,
  },
  buttonSecondary: {
    backgroundColor: Colors.secondary.main,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary.main,
  },
  buttonDisabled: {
    backgroundColor: Colors.divider,
    opacity: 0.6,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'System',
  },
  textPrimary: {
    color: Colors.primary.contrastText,
  },
  textSecondary: {
    color: Colors.secondary.contrastText,
  },
  textOutline: {
    color: Colors.primary.main,
  },
  textDisabled: {
    color: Colors.text.secondary,
  },
});

