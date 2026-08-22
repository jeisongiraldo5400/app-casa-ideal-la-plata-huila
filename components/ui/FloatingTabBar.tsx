import { useTheme } from '@/components/theme';
import { Radius, Shadows, Spacing, getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const TAB_CONFIG: Record<string, { label: string; icon: IconName; central?: boolean }> = {
  index: { label: 'Inicio', icon: 'home' },
  inventory: { label: 'Inventario', icon: 'inventory-2' },
  search: { label: 'Escanear', icon: 'qr-code-scanner', central: true },
  'exits-list': { label: 'Salidas', icon: 'local-shipping' },
  profile: { label: 'Perfil', icon: 'person' },
};

// Pantallas secundarias que deben conservar la navegación principal.
// Se muestran dentro del contexto de Inicio, pero siguen siendo rutas distintas.
const SECONDARY_ROUTE_CONTEXT: Record<string, keyof typeof TAB_CONFIG> = {
  cartera: 'index',
  negocios: 'index',
};

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;
  const activeTabRoute = activeRoute
    ? TAB_CONFIG[activeRoute]
      ? activeRoute
      : SECONDARY_ROUTE_CONTEXT[activeRoute]
    : undefined;
  const visibleRoutes = state.routes.filter((route) => TAB_CONFIG[route.name]);

  if (!activeRoute || !activeTabRoute) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background.default,
          paddingBottom: Math.max(insets.bottom, Spacing.md),
        },
      ]}>
      <View style={[styles.bar, { backgroundColor: colors.navigation.background }]}>
        {visibleRoutes.map((route) => {
          const config = TAB_CONFIG[route.name];
          const focused = activeTabRoute === route.name;
          const isCurrentRoute = activeRoute === route.name;
          const color = focused ? colors.navigation.active : colors.navigation.inactive;
          const options = descriptors[route.key]?.options;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isCurrentRoute && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? config.label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [styles.item, config.central && styles.centralItem, pressed && styles.pressed]}>
              <View style={config.central ? [styles.centralButton, { backgroundColor: colors.primary.main, borderColor: colors.navigation.background }] : styles.iconSlot}>
                <MaterialIcons name={config.icon} size={config.central ? 27 : 23} color={config.central ? colors.primary.contrastText : color} />
              </View>
              <Text style={[styles.label, { color }, config.central && styles.centralLabel]} numberOfLines={1}>{config.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { paddingTop: Spacing.sm, paddingHorizontal: Spacing.lg },
  bar: {
    height: 72,
    borderRadius: Radius.panel,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    ...Shadows.floating,
  },
  item: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  centralItem: { justifyContent: 'flex-start' },
  iconSlot: { height: 28, alignItems: 'center', justifyContent: 'center' },
  centralButton: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: -18, borderWidth: 4 },
  label: { fontSize: 10, lineHeight: 13, fontWeight: '700' },
  centralLabel: { marginTop: 1 },
  pressed: { opacity: 0.65 },
});
