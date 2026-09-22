import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type ThemeColors = {
  text: { primary: string; secondary: string };
  primary: { main: string; contrastText: string };
  warning: { main: string };
  background: { paper: string };
  divider: string;
};

type Props = {
  summary: string;
  onContinue: () => void;
  onRestart: () => void;
  colors: ThemeColors;
};

/**
 * Aviso al volver al asistente con un negocio a medias: seguir con él o empezar
 * de nuevo. Evita arrancar un negocio «nuevo» con el cliente y los productos del
 * anterior sin darse cuenta.
 */
export function NegocioDraftBanner({ summary, onContinue, onRestart, colors }: Props) {
  return (
    <View
      testID="negocio-draft-banner"
      accessibilityRole="alert"
      style={[styles.card, { backgroundColor: colors.warning.main + '14', borderColor: colors.warning.main }]}
    >
      <View style={styles.row}>
        <MaterialIcons name="edit-note" size={22} color={colors.warning.main} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.text.primary }]}>Tienes un negocio sin terminar</Text>
          <Text style={[styles.summary, { color: colors.text.secondary }]}>{summary}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onRestart}
          style={[styles.button, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}
        >
          <Text style={[styles.buttonText, { color: colors.text.primary }]}>Empezar de nuevo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onContinue}
          style={[styles.button, { backgroundColor: colors.primary.main, borderColor: colors.primary.main }]}
        >
          <Text style={[styles.buttonText, { color: colors.primary.contrastText }]}>Continuar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  summary: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700' },
});
