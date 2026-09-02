import { useTheme } from '@/components/theme';
import { Radius, Spacing, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

export type SegmentItem = { value: string; label: string; icon?: IconName; badge?: number };

interface SegmentedControlProps {
  items: SegmentItem[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ items, value, onChange }: SegmentedControlProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);

  return (
    <View style={[styles.track, { backgroundColor: colors.surface.sunken, borderColor: colors.divider }]}>
      {items.map((item) => {
        const active = item.value === value;
        const foreground = active ? colors.primary.main : colors.text.secondary;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [styles.item, active && { backgroundColor: colors.background.paper }, pressed && styles.pressed]}>
            {item.icon ? <MaterialIcons name={item.icon} size={18} color={foreground} /> : null}
            <Text style={[styles.label, { color: foreground }]} numberOfLines={1}>{item.label}</Text>
            {item.badge !== undefined ? <View style={[styles.badge, { backgroundColor: active ? colors.primary.main : colors.divider }]}><Text style={[styles.badgeText, { color: active ? colors.primary.contrastText : colors.text.secondary }]}>{item.badge}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { minHeight: 52, flexDirection: 'row', borderRadius: Radius.control, padding: Spacing.xs, borderWidth: 1, gap: Spacing.xs },
  item: { flex: 1, minHeight: 42, paddingHorizontal: Spacing.sm, borderRadius: Radius.chip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
