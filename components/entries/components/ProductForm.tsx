import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Picker } from '@react-native-picker/picker';
import { Formik, FormikHelpers } from 'formik';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Yup from 'yup';

interface ProductFormValues {
  name: string;
  sku: string;
  barcode: string;
  category_id: string;
  brand_id: string;
  description: string;
}

const productSchema = Yup.object().shape({
  name: Yup.string().required('El nombre es requerido'),
  sku: Yup.string().required('El SKU es requerido'),
  barcode: Yup.string().required('El código de barras es requerido'),
  category_id: Yup.string().required('La categoría es requerida'),
  brand_id: Yup.string().required('La marca es requerida'),
  description: Yup.string(),
});

interface ProductFormProps {
  barcode: string;
  onProductCreated: (productId: string) => void;
  onCancel: () => void;
}

export function ProductForm({ barcode, onProductCreated, onCancel }: ProductFormProps) {
  const {
    categories,
    brands,
    supplierId,
    loadCategories,
    loadBrands,
    createProduct,
    currentQuantity,
  } = useEntriesStore();

  const colorScheme = useColorScheme() ?? 'light';
  const Colors = getColors(colorScheme === 'dark');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCategories();
    loadBrands();
  }, []);

  const initialValues: ProductFormValues = {
    name: '',
    sku: '',
    barcode: barcode,
    category_id: '',
    brand_id: '',
    description: '',
  };

  const handleSubmit = async (
    values: ProductFormValues,
    { setSubmitting }: FormikHelpers<ProductFormValues>
  ) => {
    setLoading(true);
    try {
      const { product, error } = await createProduct({
        name: values.name,
        sku: values.sku,
        barcode: values.barcode,
        category_id: values.category_id,
        brand_id: values.brand_id,
        description: values.description || undefined,
        supplier_id: supplierId || undefined,
      });

      if (error) {
        Alert.alert('Error', error.message || 'Error al crear el producto');
      } else if (product) {
        // Agregar el producto a la entrada automáticamente
        useEntriesStore.getState().addProductToEntry(product, currentQuantity, barcode);
        Alert.alert('Éxito', 'Producto creado y agregado a la entrada');
        onProductCreated(product.id);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Ocurrió un error inesperado');
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: Colors.text.primary }]}>Producto no encontrado</Text>
          <Text style={[styles.subtitle, { color: Colors.text.secondary }]}>
            Registre el producto para continuar con la entrada
          </Text>
        </View>

        <Formik
          initialValues={initialValues}
          validationSchema={productSchema}
          onSubmit={handleSubmit}>
          {({
            handleChange,
            handleBlur,
            handleSubmit,
            values,
            errors,
            touched,
            isSubmitting,
          }) => (
            <>
              <Input
                label="Nombre del producto *"
                placeholder="Ej: Arroz Diana 1kg"
                value={values.name}
                onChangeText={handleChange('name')}
                onBlur={handleBlur('name')}
                error={touched.name && errors.name ? errors.name : undefined}
              />

              <Input
                label="SKU *"
                placeholder="Ej: ARR-DIA-001"
                value={values.sku}
                onChangeText={handleChange('sku')}
                onBlur={handleBlur('sku')}
                error={touched.sku && errors.sku ? errors.sku : undefined}
              />

              <Input
                label="Código de barras *"
                placeholder="Código escaneado"
                value={values.barcode}
                onChangeText={handleChange('barcode')}
                onBlur={handleBlur('barcode')}
                error={touched.barcode && errors.barcode ? errors.barcode : undefined}
                editable={false}
              />

              <View style={styles.field}>
                <Text style={[styles.label, { color: Colors.text.primary }]}>Categoría *</Text>
                <View style={[styles.pickerContainer, {
                  backgroundColor: Colors.background.paper,
                  borderColor: Colors.divider
                }]}>
                  <Picker
                    selectedValue={values.category_id}
                    onValueChange={handleChange('category_id')}
                    style={[styles.picker, { color: Colors.text.primary }]}
                    dropdownIconColor={Colors.text.primary}
                    itemStyle={[styles.pickerItem, { 
                      color: colorScheme === 'dark' ? '#1f2937' : Colors.text.primary 
                    }]}>
                    <Picker.Item label="Seleccione una categoría" value="" color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary} />
                    {categories.map((category) => (
                      <Picker.Item
                        key={category.id}
                        label={category.name}
                        value={category.id}
                        color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary}
                      />
                    ))}
                  </Picker>
                </View>
                {touched.category_id && errors.category_id && (
                  <Text style={[styles.errorText, { color: Colors.error.main }]}>{errors.category_id}</Text>
                )}
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: Colors.text.primary }]}>Marca *</Text>
                <View style={[styles.pickerContainer, {
                  backgroundColor: Colors.background.paper,
                  borderColor: Colors.divider
                }]}>
                  <Picker
                    selectedValue={values.brand_id}
                    onValueChange={handleChange('brand_id')}
                    style={[styles.picker, { color: Colors.text.primary }]}
                    dropdownIconColor={Colors.text.primary}
                    itemStyle={[styles.pickerItem, { 
                      color: colorScheme === 'dark' ? '#1f2937' : Colors.text.primary 
                    }]}>
                    <Picker.Item label="Seleccione una marca" value="" color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary} />
                    {brands.map((brand) => (
                      <Picker.Item
                        key={brand.id}
                        label={brand.name || 'Sin nombre'}
                        value={brand.id}
                        color={colorScheme === 'dark' ? '#1f2937' : Colors.text.primary}
                      />
                    ))}
                  </Picker>
                </View>
                {touched.brand_id && errors.brand_id && (
                  <Text style={[styles.errorText, { color: Colors.error.main }]}>{errors.brand_id}</Text>
                )}
              </View>

              <Input
                label="Descripción"
                placeholder="Descripción opcional del producto"
                value={values.description}
                onChangeText={handleChange('description')}
                onBlur={handleBlur('description')}
                multiline
                numberOfLines={3}
                error={touched.description && errors.description ? errors.description : undefined}
              />

              <View style={styles.buttons}>
                <Button
                  title="Cancelar"
                  onPress={onCancel}
                  variant="outline"
                  style={[styles.button, styles.cancelButton]}
                />
                <Button
                  title="Crear y Agregar"
                  onPress={() => handleSubmit()}
                  loading={loading || isSubmitting}
                  style={styles.button}
                />
              </View>
            </>
          )}
        </Formik>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    margin: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 56,
    justifyContent: 'center',
  },
  picker: {
    height: 56,
  },
  pickerItem: {
    height: 56,
    fontSize: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
  },
  cancelButton: {
    flex: 1,
  },
});

