import { useEntriesStore } from '@/components/entries/infrastructure/store/entriesStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Colors } from '@/constants/theme';
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
          <Text style={styles.title}>Producto no encontrado</Text>
          <Text style={styles.subtitle}>
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
                <Text style={styles.label}>Categoría *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={values.category_id}
                    onValueChange={handleChange('category_id')}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}>
                    <Picker.Item label="Seleccione una categoría" value="" />
                    {categories.map((category) => (
                      <Picker.Item
                        key={category.id}
                        label={category.name}
                        value={category.id}
                      />
                    ))}
                  </Picker>
                </View>
                {touched.category_id && errors.category_id && (
                  <Text style={styles.errorText}>{errors.category_id}</Text>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Marca *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={values.brand_id}
                    onValueChange={handleChange('brand_id')}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}>
                    <Picker.Item label="Seleccione una marca" value="" />
                    {brands.map((brand) => (
                      <Picker.Item
                        key={brand.id}
                        label={brand.name || 'Sin nombre'}
                        value={brand.id}
                      />
                    ))}
                  </Picker>
                </View>
                {touched.brand_id && errors.brand_id && (
                  <Text style={styles.errorText}>{errors.brand_id}</Text>
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
    color: Colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: Colors.divider,
    borderRadius: 8,
    backgroundColor: Colors.background.paper,
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
    color: Colors.text.primary,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error.main,
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

