import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

interface DashboardCardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: string;
  iconColor: string;
  trend?: 'up' | 'down';
}

export function DashboardCard({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  trend,
}: DashboardCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.iconContainer, { backgroundColor: iconColor + '20' }]}>
          <MaterialIcons name={icon as any} size={24} color={iconColor} />
        </View>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {trend && (
        <View style={styles.trendContainer}>
          <MaterialIcons
            name={trend === 'up' ? 'trending-up' : 'trending-down'}
            size={16}
            color={trend === 'up' ? Colors.success.main : Colors.error.main}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    marginHorizontal: 6,
    minHeight: 140,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
    flex: 1,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  value: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  trendContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
});

