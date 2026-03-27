import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface QuantityInputProps {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
}

export function QuantityInput({
  quantity,
  onQuantityChange,
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
            // Si el texto está vacío, establecer a 0
            if (text === '') {
              if (onQuantityChange) {
                onQuantityChange(0);
              }
              return;
            }
            
            // Intentar parsear el número
            const num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0) {
              if (onQuantityChange) {
                onQuantityChange(num);
              }
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
});

