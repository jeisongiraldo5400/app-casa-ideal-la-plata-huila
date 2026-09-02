import { useTheme } from '@/components/theme';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton } from './IconButton';

interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Fila de botones al pie (normalmente `Button`s con `flex: 1`). */
  footer?: React.ReactNode;
  /** Si es false, el cierre por backdrop, botón X y back queda bloqueado (p. ej. guardando). */
  dismissable?: boolean;
}

/** Diálogo centrado con overlay, encabezado y pie de acciones. */
export function ModalSheet({ visible, onClose, title, subtitle, children, footer, dismissable = true }: ModalSheetProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const requestClose = () => {
    if (dismissable) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessible={false} style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={requestClose} />
        <View style={[styles.card, { backgroundColor: colors.background.paper }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.copy}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
              {subtitle ? <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{subtitle}</Text> : null}
            </View>
            <IconButton icon="close" onPress={requestClose} accessibilityLabel="Cerrar" style={styles.close} />
          </View>
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: Radius.panel, padding: Spacing.xl, gap: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  copy: { flex: 1, gap: 2 },
  title: { ...Typography.section },
  subtitle: { ...Typography.caption },
  close: { width: 40, height: 40 },
  body: { gap: Spacing.md },
  footer: { flexDirection: 'row', gap: Spacing.sm },
});
