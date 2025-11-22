import { useTheme } from '@/components/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getColors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';

function ProfileHeaderButton() {
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  return (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/profile')}
      style={{ marginRight: 16 }}>
      <MaterialIcons name="account-circle" size={28} color={colors.primary.contrastText} />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary.main,
        tabBarInactiveTintColor: colors.text.secondary,
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.primary.main,
        },
        headerTintColor: colors.primary.contrastText,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.background.paper,
          borderTopColor: colors.primary.main,
          borderTopWidth: 2,
          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: -1,
          },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 5,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarLabel: 'Inicio',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
          headerRight: () => <ProfileHeaderButton />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventario',
          tabBarLabel: 'Inventario',
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
            <MaterialIcons name="qr-code-scanner" size={32} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="exits-list"
        options={{
          title: 'Salidas',
          tabBarLabel: 'Salidas',
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
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="entries"
        options={{
          href: null, // Ocultar del tab bar pero mantener la ruta accesible
          title: 'Entradas',
        }}
      />
      <Tabs.Screen
        name="exits"
        options={{
          href: null, // Ocultar del tab bar pero mantener la ruta accesible
          title: 'Salidas',
        }}
      />
      <Tabs.Screen
        name="received-orders"
        options={{
          href: null, // Ocultar del tab bar pero mantener la ruta accesible
          title: 'Mis Órdenes Recibidas',
        }}
      />
      <Tabs.Screen
        name="all-orders"
        options={{
          href: null, // Ocultar del tab bar pero mantener la ruta accesible
          title: 'Todas las Órdenes',
        }}
      />
    </Tabs>
  );
}
