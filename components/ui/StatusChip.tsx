import { useTheme } from '@/components/theme';
import { Radius, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export function StatusChip({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const accent = tone === 'neutral' ? colors.text.secondary : tone === 'primary' ? colors.primary.main : colors[tone].main;
  return <View style={[styles.chip, { backgroundColor: `${accent}18` }]}>{icon ? <MaterialIcons name={icon} size={14} color={accent} /> : null}<Text style={[styles.text, { color: accent }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
  text: { fontSize: 11, lineHeight: 15, fontWeight: '800' },
});
