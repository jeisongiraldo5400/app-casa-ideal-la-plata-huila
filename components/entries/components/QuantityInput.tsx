import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/theme';

interface QuantityInputProps {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onSubmit: () => void;
  loading?: boolean;
}

export function QuantityInput({
  quantity,
  onQuantityChange,
  onSubmit,
  loading = false,
}: QuantityInputProps) {
  const handleIncrement = () => {
    onQuantityChange(quantity + 1);
  };

  const handleDecrement = () => {
    if (quantity > 0) {
      onQuantityChange(quantity - 1);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Cantidad recibida</Text>
      
      <View style={styles.quantityContainer}>
        <TouchableOpacity
          style={[styles.button, quantity === 0 && styles.buttonDisabled]}
          onPress={handleDecrement}
          disabled={quantity === 0}>
          <Text style={styles.buttonText}>-</Text>
        </TouchableOpacity>
        
        <Input
          value={quantity.toString()}
          onChangeText={(text) => {
            const num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0) {
              onQuantityChange(num);
            } else if (text === '') {
              onQuantityChange(0);
            }
          }}
          keyboardType="numeric"
          style={styles.input}
          containerStyle={styles.inputContainer}
        />
        
        <TouchableOpacity style={styles.button} onPress={handleIncrement}>
          <Text style={styles.buttonText}>+</Text>
        </TouchableOpacity>
      </View>

      <Button
        title="Registrar entrada"
        onPress={onSubmit}
        loading={loading}
        disabled={quantity <= 0}
        style={styles.submitButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: Colors.divider,
    opacity: 0.5,
  },
  buttonText: {
    color: Colors.background.paper,
    fontSize: 24,
    fontWeight: '600',
  },
  inputContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 0,
  },
  input: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 8,
  },
});

