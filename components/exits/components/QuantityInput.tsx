import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface QuantityInputProps {
  quantity: number;
  maxQuantity: number;
  onQuantityChange: (quantity: number) => void;
}

export function QuantityInput({
  quantity,
  maxQuantity,
  onQuantityChange,
}: QuantityInputProps) {
  const handleIncrement = () => {
    if (quantity < maxQuantity) {
      onQuantityChange(quantity + 1);
    }
  };

  const handleDecrement = () => {
    if (quantity > 0) {
      onQuantityChange(quantity - 1);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.stockInfo}>
        <Text style={styles.stockLabel}>Stock disponible:</Text>
        <Text style={styles.stockValue}>{maxQuantity} unidad{maxQuantity !== 1 ? 'es' : ''}</Text>
      </View>

      <Text style={styles.label}>Cantidad a salir</Text>
      
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
            if (text === '') {
              onQuantityChange(0);
              return;
            }
            
            const num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= maxQuantity) {
              onQuantityChange(num);
            }
          }}
          keyboardType="numeric"
          style={styles.input}
          containerStyle={styles.inputContainer}
        />
        
        <TouchableOpacity
          style={[styles.button, quantity >= maxQuantity && styles.buttonDisabled]}
          onPress={handleIncrement}
          disabled={quantity >= maxQuantity}>
          <Text style={styles.buttonText}>+</Text>
        </TouchableOpacity>
      </View>

      {quantity > maxQuantity && (
        <Text style={styles.errorText}>
          La cantidad no puede exceder el stock disponible
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 0,
  },
  stockInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    padding: 12,
    backgroundColor: Colors.info.light + '20',
    borderRadius: 8,
  },
  stockLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  stockValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.info.main,
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
  errorText: {
    fontSize: 12,
    color: Colors.error.main,
    marginBottom: 8,
    textAlign: 'center',
  },
});

