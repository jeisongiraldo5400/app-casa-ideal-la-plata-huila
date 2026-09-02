import { useTheme } from '@/components/theme';
import { Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionBar } from './ActionBar';
import { IconButton } from './IconButton';

interface FullScreenModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Control a la derecha del título (IconButton, texto). */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  /** Pie fijo; se renderiza dentro de un `ActionBar` (ya respeta `insets.bottom`). */
  footer?: React.ReactNode;
  /** Si es false, el cierre por X y por back queda bloqueado (p. ej. guardando). */
  dismissable?: boolean;
}

/**
 * Modal a pantalla completa con área segura. Con `edgeToEdgeEnabled` el
 * contenido se dibuja bajo la barra de estado, así que el padding superior
 * sale de `useSafeAreaInsets`. No usar `presentationStyle="pageSheet"`:
 * Android lo ignora y pinta el modal desde y = 0.
 */
export function FullScreenModal({
  visible,
  onClose,
  title,
  subtitle,
  headerAction,
  children,
  footer,
  dismissable = true,
}: FullScreenModalProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const requestClose = () => {
    if (dismissable) onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}>
      <View
        testID="fullscreen-modal-root"
        style={[
          styles.root,
          {
            backgroundColor: colors.background.default,
            paddingTop: Math.max(insets.top, Spacing.sm),
            paddingBottom: footer ? 0 : insets.bottom,
          },
        ]}>
        <View style={[styles.header, { borderBottomColor: colors.divider }]}>
          <IconButton icon="close" onPress={requestClose} accessibilityLabel="Cerrar" disabled={!dismissable} style={styles.close} />
          <View style={styles.copy}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.text.secondary }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerAction ? <View style={styles.action}>{headerAction}</View> : null}
        </View>
        <View style={styles.body}>{children}</View>
        {footer ? <ActionBar>{footer}</ActionBar> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  close: { width: 42, height: 42 },
  copy: { flex: 1 },
  title: { ...Typography.section },
  subtitle: { ...Typography.caption, marginTop: 1 },
  action: { alignItems: 'flex-end' },
  body: { flex: 1 },
});
