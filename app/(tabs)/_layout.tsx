import { useTheme } from '@/components/theme';
import { BackButton, FloatingTabBar, IconButton } from '@/components/ui';
import { IconSize, Typography, getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Tabs, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

const isWeb = Platform.OS === 'web';

function HeaderIconButton({ icon, label, onPress }: { icon: 'person' | 'person-search'; label: string; onPress: () => void }) {
  return <IconButton icon={icon} onPress={onPress} accessibilityLabel={label} size={IconSize.md} style={styles.headerButton} />;
}

function ProfileHeaderButton() {
  const router = useRouter();
  return <HeaderIconButton icon="person" label="Abrir perfil" onPress={() => router.navigate('/(tabs)/profile')} />;
}

function SearchCustomerHeaderButton() {
  const router = useRouter();
  return <HeaderIconButton icon="person-search" label="Buscar cliente" onPress={() => router.navigate('/(tabs)/buscar-cliente' as never)} />;
}

export default function TabLayout() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const { loading } = useUserRoles();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary.main} />
      </View>
    );
  }

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      backBehavior={isWeb ? 'none' : 'firstRoute'}
      detachInactiveScreens={!isWeb}
      screenOptions={{
        animation: isWeb ? 'none' : undefined,
        sceneStyle: { backgroundColor: colors.background.default },
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background.default,
        },
        headerTintColor: colors.text.primary,
        headerTitleStyle: { ...Typography.section },
        headerTitleAlign: 'left',
        headerShadowVisible: false,
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarLabel: 'Inicio',
          headerShown: false,
          headerRight: () => <ProfileHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="negocios"
        options={{
          title: 'Negocios',
          tabBarLabel: 'Negocios',
          href: null,
          headerLeft: () => <BackButton />,
          headerRight: () => <SearchCustomerHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="cartera"
        options={{
          title: 'Cartera',
          tabBarLabel: 'Cartera',
          href: null,
          headerLeft: () => <BackButton />,
        }}
      />

      <Tabs.Screen
        name="ruta-cobros"
        options={{
          title: 'Ruta de cobros',
          href: null,
          headerLeft: () => <BackButton />,
          headerRight: () => <ProfileHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="ruta-cobros-crear"
        options={{
          title: 'Crear ruta',
          href: null,
          headerLeft: () => <BackButton />,
        }}
      />

      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventario',
          tabBarLabel: 'Inventario',
          headerShown: false,
          headerRight: () => <ProfileHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: 'Búsqueda Rápida',
          tabBarLabel: 'Buscar',
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="exits-list"
        options={{
          title: 'Salidas',
          tabBarLabel: 'Salidas',
          headerShown: false,
          headerRight: () => <ProfileHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarLabel: 'Perfil',
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="negocio-create"
        options={{
          href: null,
          title: 'Nuevo negocio',
          headerLeft: () => <BackButton />,
        }}
      />

      <Tabs.Screen
        name="buscar-cliente"
        options={{
          href: null,
          title: 'Buscar por cliente',
          headerLeft: () => <BackButton />,
          headerRight: () => <ProfileHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="entries"
        options={{
          href: null,
          title: 'Entradas',
          headerLeft: () => <BackButton />,
        }}
      />
      <Tabs.Screen
        name="exits"
        options={{
          href: null,
          title: 'Salidas',
          headerLeft: () => <BackButton />,
        }}
      />
      <Tabs.Screen
        name="received-orders"
        options={{
          href: null,
          title: 'Historial de órdenes recibidas',
          headerLeft: () => <BackButton />,
        }}
      />
      <Tabs.Screen
        name="my-orders"
        options={{
          href: null,
          title: 'Mis órdenes asignadas',
          headerLeft: () => <BackButton />,
        }}
      />
      <Tabs.Screen
        name="all-orders"
        options={{
          href: null,
          title: 'Todas las Órdenes',
          headerLeft: () => <BackButton />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          href: null,
          title: 'Reportes',
          headerLeft: () => <BackButton />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: { width: 42, height: 42, marginRight: 12 },
});
