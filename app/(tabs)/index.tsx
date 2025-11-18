import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Colors } from '@/constants/theme';
import { Card } from '@/components/ui/Card';

export default function HomeScreen() {
  const { user } = useAuth();

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
          Desde aquí puedes gestionar las entradas de productos y mantener el control
          de tu inventario en tiempo real.
        </Text>
      </Card>

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
});
