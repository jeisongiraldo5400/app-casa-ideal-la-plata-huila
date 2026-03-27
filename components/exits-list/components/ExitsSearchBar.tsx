import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useExitsList } from '@/components/exits-list/infrastructure/hooks/useExitsList';
import { Colors } from '@/constants/theme';

export function ExitsSearchBar() {
  const { searchQuery, setSearchQuery } = useExitsList();

  return (
    <View style={styles.container}>
      <MaterialIcons name="search" size={20} color={Colors.text.secondary} style={styles.icon} />
      <TextInput
        style={styles.input}
        placeholder="Buscar por nombre de producto, SKU, código de barras..."
        placeholderTextColor={Colors.text.secondary}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
          <MaterialIcons
            name="clear"
            size={20}
            color={Colors.text.secondary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.paper,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: Colors.text.primary,
  },
  clearButton: {
    marginLeft: 8,
    padding: 4,
  },
});

