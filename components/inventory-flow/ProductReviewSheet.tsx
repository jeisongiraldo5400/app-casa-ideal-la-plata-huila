import { useTheme } from '@/components/theme';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Radius, Shadows, Spacing, Typography, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ProductReviewSheetProps {
  visible: boolean;
  product: { name: string; sku: string | null; barcode: string };
  title?: string;
  subtitle?: string;
  /** Contenido específico del módulo entre la ficha del producto y el stepper (bodega, métricas, avisos). */
  children?: React.ReactNode;
  /** Oculta el stepper (p. ej. mientras falta elegir bodega o no hay stock). */
  showQuantity?: boolean;
  quantityLabel: string;
  quantity: number;
  maxQuantity: number;
  /** Bloquea los controles mientras se consulta algo (stock, orden). */
  busy?: boolean;
  valid: boolean;
  error: string | null;
  addLabel?: string;
  addAndScanLabel?: string;
  onQuantityChange: (quantity: number) => void;
  onCancel: () => void;
  onAdd: () => void;
  onAddAndScan: () => void;
}

/**
 * Hoja inferior para confirmar cantidad (y datos del módulo) de un producto escaneado.
 * Se dibuja sobre la lista de la sesión para no perder el contexto de lo ya agregado.
 */
export function ProductReviewSheet({
  visible,
  product,
  title = 'Verificar producto',
  subtitle = 'Confirma la cantidad antes de agregar',
  children,
  showQuantity = true,
  quantityLabel,
  quantity,
  maxQuantity,
  busy = false,
  valid,
  error,
  addLabel = 'Agregar y volver a la lista',
  addAndScanLabel = 'Agregar y escanear siguiente',
  onQuantityChange,
  onCancel,
  onAdd,
  onAddAndScan,
}: ProductReviewSheetProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const cap = Math.max(maxQuantity, 0);
  const clamp = (value: number) => Math.min(Math.max(value, 0), cap);
  const canDecrease = quantity > 1 && !busy;
  const canIncrease = quantity < cap && !busy;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessible={false} style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onCancel} />
        <View
          style={[styles.sheet, { backgroundColor: colors.background.paper, paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}
          accessibilityViewIsModal
        >
          <View style={[styles.grabber, { backgroundColor: colors.divider }]} />
          <View style={styles.titleRow}>
            <View style={styles.copy}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
              <Text style={[styles.subtitle, { color: colors.text.secondary }]}>{subtitle}</Text>
            </View>
            <IconButton icon="close" onPress={onCancel} accessibilityLabel="Cancelar revisión del producto" style={styles.close} />
          </View>
          <View style={[styles.header, { backgroundColor: colors.surface.muted }]}>
            <View style={[styles.foundIcon, { backgroundColor: `${colors.success.main}16` }]}>
              <MaterialIcons name="check" size={24} color={colors.success.main} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.eyebrow, { color: colors.success.main }]}>Producto encontrado</Text>
              <Text style={[styles.name, { color: colors.text.primary }]}>{product.name}</Text>
              <Text style={[styles.meta, { color: colors.text.secondary }]}>SKU: {product.sku || '—'} · {product.barcode}</Text>
            </View>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}

            {showQuantity ? (
              <View style={styles.quantitySection}>
                <Text style={[styles.quantityLabel, { color: colors.text.primary }]}>{quantityLabel}</Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    disabled={!canDecrease}
                    onPress={() => onQuantityChange(clamp(quantity - 1))}
                    accessibilityRole="button"
                    accessibilityLabel="Disminuir cantidad"
                    accessibilityState={{ disabled: !canDecrease }}
                    style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.primary.main }, !canDecrease && styles.disabled, pressed && styles.pressed]}
                  >
                    <MaterialIcons name="remove" size={25} color={colors.primary.contrastText} />
                  </Pressable>
                  <Input
                    value={String(quantity)}
                    onChangeText={(text) => {
                      const next = Number.parseInt(text, 10);
                      onQuantityChange(Number.isFinite(next) ? clamp(next) : 0);
                    }}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    editable={!busy}
                    containerStyle={styles.inputContainer}
                    style={styles.input}
                    accessibilityLabel={quantityLabel}
                  />
                  <Pressable
                    disabled={!canIncrease}
                    onPress={() => onQuantityChange(clamp(quantity + 1))}
                    accessibilityRole="button"
                    accessibilityLabel="Aumentar cantidad"
                    accessibilityState={{ disabled: !canIncrease }}
                    style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.primary.main }, !canIncrease && styles.disabled, pressed && styles.pressed]}
                  >
                    <MaterialIcons name="add" size={25} color={colors.primary.contrastText} />
                  </Pressable>
                </View>
                <View style={styles.quickRow}>
                  <Pressable onPress={() => onQuantityChange(clamp(1))} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.quick, { borderColor: colors.divider }, pressed && styles.pressed]}>
                    <Text style={[styles.quickText, { color: colors.primary.main }]}>1 unidad</Text>
                  </Pressable>
                  {Number.isFinite(cap) && cap > 0 && cap < 1000 ? (
                    <Pressable onPress={() => onQuantityChange(cap)} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.quick, { borderColor: colors.divider }, pressed && styles.pressed]}>
                      <Text style={[styles.quickText, { color: colors.primary.main }]}>Todo ({cap})</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {error ? (
              <Text style={[styles.error, { color: colors.error.main }]} accessibilityLiveRegion="assertive">{error}</Text>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button title={addAndScanLabel} onPress={onAddAndScan} disabled={!valid} icon="qr-code-scanner" />
            <Button title={addLabel} variant="outline" onPress={onAdd} disabled={!valid} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: Radius.panel,
    borderTopRightRadius: Radius.panel,
    maxHeight: '92%',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    ...Shadows.floating,
  },
  grabber: { alignSelf: 'center', borderRadius: Radius.pill, height: 4, marginBottom: Spacing.md, width: 40 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  title: { ...Typography.section },
  header: { alignItems: 'center', borderRadius: Radius.control, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  foundIcon: { alignItems: 'center', borderRadius: Radius.icon, height: 46, justifyContent: 'center', width: 46 },
  copy: { flex: 1 },
  eyebrow: { ...Typography.label },
  name: { ...Typography.bodyStrong, fontSize: 17, lineHeight: 22 },
  meta: { ...Typography.metadata, marginTop: 2 },
  close: { width: 40, height: 40 },
  subtitle: { ...Typography.caption, marginTop: 2 },
  scroll: { flexGrow: 0 },
  body: { gap: Spacing.md, paddingVertical: Spacing.lg },
  quantitySection: { gap: Spacing.md },
  quantityLabel: { ...Typography.bodySmallStrong, textAlign: 'center' },
  stepperRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  stepButton: { alignItems: 'center', borderRadius: Radius.control, height: 52, justifyContent: 'center', width: 52 },
  inputContainer: { flex: 1, marginBottom: 0 },
  input: { ...Typography.headline, textAlign: 'center' },
  quickRow: { flexDirection: 'row', gap: Spacing.sm },
  quick: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44 },
  quickText: { ...Typography.bodySmallStrong },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  error: { ...Typography.metadata, fontWeight: '600', textAlign: 'center' },
  footer: { gap: Spacing.sm, paddingTop: Spacing.sm },
});
