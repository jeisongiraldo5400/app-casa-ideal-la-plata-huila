import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { MaterialIcons } from '@expo/vector-icons';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const handleRegisterEntries = () => {
    router.push('/(tabs)/entries');
  };

  const handleRegisterExits = () => {
    router.push('/(tabs)/exits');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Casa Ideal</Text>
        <Text style={styles.subtitle}>Bienvenido de vuelta</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Resumen</Text>
        <Text style={styles.cardText}>
          Bienvenido al sistema de gestión de inventario de Casa Ideal La Plata Huila.
        </Text>
        <Text style={styles.cardText}>
          Desde aquí puedes gestionar las entradas y salidas de productos y mantener el control
          de tu inventario en tiempo real.
        </Text>
      </Card>

      <View style={styles.menuSection}>
        <Text style={styles.menuTitle}>Menú de Operaciones</Text>
        
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={handleRegisterEntries}
          activeOpacity={0.7}
        >
          <View style={styles.menuItemContent}>
            <MaterialIcons 
              name="input" 
              size={24} 
              color={Colors.primary.main} 
              style={styles.menuIcon}
            />
            <Text style={styles.menuItemText}>Registrar entradas de artículos</Text>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={Colors.text.secondary} 
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={handleRegisterExits}
          activeOpacity={0.7}
        >
          <View style={styles.menuItemContent}>
            <MaterialIcons 
              name="exit-to-app" 
              size={24} 
              color={Colors.primary.main} 
              style={styles.menuIcon}
            />
            <Text style={styles.menuItemText}>
              Registrar salidas de artículos
            </Text>
            <MaterialIcons 
              name="chevron-right" 
              size={24} 
              color={Colors.text.secondary} 
            />
          </View>
        </TouchableOpacity>
      </View>

      {user && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Sesión activa</Text>
          <Text style={styles.cardText}>
            <Text style={styles.label}>Usuario: </Text>
            {user.email}
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.default,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
  },
  card: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  cardText: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  label: {
    fontWeight: '600',
    color: Colors.text.primary,
  },
  button: {
    marginTop: 8,
  },
  menuSection: {
    marginBottom: 24,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  menuItem: {
    backgroundColor: Colors.background.paper,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuIcon: {
    marginRight: 12,
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  menuItemTextDisabled: {
    color: Colors.text.secondary,
    opacity: 0.6,
  },
});
