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
          backgroundColor: Colors.background.paper,
          borderTopColor: Colors.divider,
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
          title: 'Entradas',
          tabBarLabel: 'Entradas',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="plus.circle.fill" color={color} />
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
