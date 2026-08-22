import { useTheme } from '@/components/theme';
import { BackButton } from '@/components/ui/BackButton';
import { FloatingTabBar, IconButton } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getColors } from '@/constants/theme';
import { useUserRoles } from '@/hooks/useUserRoles';
import { MaterialIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

function ProfileHeaderButton() {
  const router = useRouter();
  return (
    <IconButton
      icon="person"
      onPress={() => router.push('/(tabs)/profile')}
      accessibilityLabel="Abrir perfil"
      size={21}
      style={{ width: 42, height: 42, marginRight: 12 }}
    />
  );
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
      screenOptions={{
        sceneStyle: { backgroundColor: colors.background.default },
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.background.default,
        },
        headerTintColor: colors.text.primary,
        headerTitleStyle: { fontSize: 18, fontWeight: '800' },
        headerTitle: '',
        headerShadowVisible: false,
        tabBarHideOnKeyboard: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarLabel: 'Inicio',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
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
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="handshake" size={28} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="cartera"
        options={{
          title: 'Cartera',
          tabBarLabel: 'Cartera',
          href: null,
          headerLeft: () => <BackButton />,
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="account-balance-wallet" size={28} color={color} />
          ),
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
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="inventory" size={28} color={color} />
          ),
          headerRight: () => <ProfileHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="search"
        options={{
          title: 'Búsqueda Rápida',
          tabBarLabel: 'Buscar',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="qr-code-scanner" size={28} color={color} />
          ),
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="exits-list"
        options={{
          title: 'Salidas',
          tabBarLabel: 'Salidas',
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="local-shipping" size={28} color={color} />
          ),
          headerRight: () => <ProfileHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="account-circle" size={28} color={color} />
          ),
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
