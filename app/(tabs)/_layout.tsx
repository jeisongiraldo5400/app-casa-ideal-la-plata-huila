import { useTheme } from '@/components/theme';
import { BackButton, FloatingTabBar, IconButton } from '@/components/ui';
import { CATALOGOS_HABILITADOS } from '@/constants/features';
import { IconSize, Typography, getColors } from '@/constants/theme';
import { useNavigateWithLoading } from '@/hooks/useNavigateWithLoading';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

const isWeb = Platform.OS === 'web';

function HeaderIconButton({ icon, label, onPress }: { icon: 'person' | 'person-search'; label: string; onPress: () => void }) {
  return <IconButton icon={icon} onPress={onPress} accessibilityLabel={label} size={IconSize.md} style={styles.headerButton} />;
}

function ProfileHeaderButton() {
  const navigate = useNavigateWithLoading();
  return <HeaderIconButton icon="person" label="Abrir perfil" onPress={() => navigate('/(tabs)/profile')} />;
}

function CustomersHeaderButton() {
  const navigate = useNavigateWithLoading();
  return <HeaderIconButton icon="person-search" label="Clientes" onPress={() => navigate('/(tabs)/clientes' as never)} />;
}

export default function TabLayout() {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  // Arranca la carga de roles lo antes posible, pero NO bloquea el navegador:
  // antes un ActivityIndicator tapaba todas las pestañas hasta que la red
  // contestaba. Ninguna pestaña visible depende del rol —las pantallas que sí
  // lo exigen (reportes, ruta de cobros, cartera…) siguen cerrándose solas
  // mientras `loading` sea true—, así que pintarlas antes no abre accesos.
  useUserRoles();

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
          headerRight: () => <CustomersHeaderButton />,
        }}
      />

      <Tabs.Screen
        name="mis-negocios"
        options={{
          title: 'Mis negocios',
          href: null,
          headerLeft: () => <BackButton />,
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
        name="clientes"
        options={{
          href: null,
          title: 'Clientes',
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
      {/*
        Catálogos: visible desde el 2026-09-22 (CATALOGOS_HABILITADOS en
        constants/features.ts). Las dos pantallas llevan `href: null` para no
        salir como pestañas: se entra desde el inicio. Si la bandera se apaga,
        cada una redirige al inicio antes de montar nada.
      */}
      <Tabs.Screen
        name="catalogos"
        options={{
          href: null,
          title: CATALOGOS_HABILITADOS ? 'Catálogos' : '',
          headerShown: CATALOGOS_HABILITADOS,
          headerLeft: () => <BackButton />,
        }}
      />
      <Tabs.Screen
        name="catalogo-create"
        options={{
          href: null,
          title: CATALOGOS_HABILITADOS ? 'Nuevo catálogo' : '',
          headerShown: CATALOGOS_HABILITADOS,
          headerLeft: () => <BackButton />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: { width: 42, height: 42, marginRight: 12 },
});
