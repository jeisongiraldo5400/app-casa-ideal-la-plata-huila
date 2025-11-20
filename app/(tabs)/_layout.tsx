import { Tabs, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { MaterialIcons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';

function ProfileHeaderButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/profile')}
      style={{ marginRight: 16 }}>
      <MaterialIcons name="account-circle" size={28} color={Colors.text.primary} />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary.main,
        tabBarInactiveTintColor: Colors.text.secondary,
        headerShown: true,
        headerStyle: {
          backgroundColor: Colors.background.paper,
        },
        headerTintColor: Colors.text.primary,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: Colors.primary.main,
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
        name="entries"
        options={{
          href: null, // Ocultar del tab bar pero mantener la ruta accesible
          title: 'Entradas',
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
    </Tabs>
  );
}
