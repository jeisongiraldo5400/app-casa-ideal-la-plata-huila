import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/components/auth/infrastructure/hooks/useAuth';
import { Colors } from '@/constants/theme';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Casa Ideal</Text>
        <Text style={styles.subtitle}>Bienvenido de vuelta</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Información de sesión</Text>
        <Text style={styles.cardText}>
          <Text style={styles.label}>Email: </Text>
          {user?.email}
        </Text>
        <Text style={styles.cardText}>
          <Text style={styles.label}>ID: </Text>
          {user?.id}
        </Text>
      </Card>

      <Button
        title="Cerrar sesión"
        onPress={handleSignOut}
        variant="outline"
        style={styles.button}
      />
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
