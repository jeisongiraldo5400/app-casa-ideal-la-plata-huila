import { useTheme } from '@/components/theme';
import { Button, FullScreenModal, SearchField, SegmentedControl } from '@/components/ui';
import { Radius, Spacing, Typography, getColors } from '@/constants/theme';
import type { CarteraFilter, Municipio } from '@/lib/cartera/carteraService';
import type { SellerOption } from '@/lib/users/sellersService';
import type { PaymentMethodOption } from '@/components/negocios/infrastructure/services/paymentMethodsService';
import { NegocioDatePicker } from '@/components/negocios/components/NegocioDatePicker';
import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type CarteraFilterValues = {
  filter: CarteraFilter;
  search: string;
  municipioId: string;
  days: number;
  searchMunicipio: string;
  sellerId: string;
  searchSeller: string;
  /** Vendedor al que pertenece el CLIENTE; independiente de `sellerId`. */
  customerSellerId: string;
  searchCustomerSeller: string;
  /** Cuotas con al menos un abono vigente de ese método. */
  paymentMethodId: string;
  /** Rango sobre la fecha de vencimiento de la cuota. */
  dueFrom: string;
  dueTo: string;
};

type Props = {
  visible: boolean;
  municipios: Municipio[];
  sellers?: SellerOption[];
  paymentMethods?: PaymentMethodOption[];
  values: CarteraFilterValues;
  onChange: (next: CarteraFilterValues) => void;
  onClose: () => void;
};

const FILTERS: { id: CarteraFilter; label: string }[] = [
  { id: 'todas', label: 'Todas abiertas' },
  { id: 'por_vencer', label: 'Por vencer' },
  { id: 'vencidas', label: 'Vencidas' },
  { id: 'mora', label: 'En mora' },
  { id: 'pagadas', label: 'Pagadas' },
];

const DAYS = [7, 15, 30].map((days) => ({ value: String(days), label: `${days} días` }));

export const DEFAULT_CARTERA_FILTERS: CarteraFilterValues = {
  filter: 'todas',
  search: '',
  municipioId: '',
  days: 15,
  searchMunicipio: '',
  sellerId: '',
  searchSeller: '',
  customerSellerId: '',
  searchCustomerSeller: '',
  paymentMethodId: '',
  dueFrom: '',
  dueTo: '',
};

/** Filtros de cartera a pantalla completa (estado, búsqueda, municipio, vendedor, días). */
export function CarteraFilterModal({ visible, municipios, sellers = [], paymentMethods = [], values, onChange, onClose }: Props) {
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const selectedMunicipio = municipios.find((item) => item.id === values.municipioId);
  const searchMunicipio = values.searchMunicipio || '';
  const selectedSeller = sellers.find((item) => item.id === values.sellerId);
  const searchSeller = values.searchSeller || '';
  const availableSellers = sellers
    .filter((item) => item.full_name.toLowerCase().includes(searchSeller.toLowerCase()))
    .slice(0, 30);
  const selectedCustomerSeller = sellers.find((item) => item.id === values.customerSellerId);
  const searchCustomerSeller = values.searchCustomerSeller || '';
  const availableCustomerSellers = sellers
    .filter((item) => item.full_name.toLowerCase().includes(searchCustomerSeller.toLowerCase()))
    .slice(0, 30);
  const available = municipios
    .filter((item) => item.nombre.toLowerCase().includes(searchMunicipio.toLowerCase()))
    .slice(0, 30);
  const patch = (next: Partial<CarteraFilterValues>) => onChange({ ...values, ...next });

  return (
    <FullScreenModal
      visible={visible}
      onClose={onClose}
      title="Filtros de cartera"
      footer={
        <>
          <Button title="Limpiar" variant="outline" onPress={() => onChange(DEFAULT_CARTERA_FILTERS)} style={styles.footerButton} />
          <Button title="Aplicar filtros" onPress={onClose} style={styles.footerButton} />
        </>
      }>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Estado de la cuota</Text>
          <View style={styles.chips}>
            {FILTERS.map((item) => {
              const selected = values.filter === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ filter: item.id })}
                  style={({ pressed }) => [
                    styles.chip,
                    { borderColor: selected ? colors.primary.main : colors.divider, backgroundColor: selected ? colors.primary.main : colors.background.paper },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.chipText, { color: selected ? colors.primary.contrastText : colors.text.primary }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {values.filter === 'por_vencer' ? (
          <View style={styles.group}>
            <Text style={[styles.label, { color: colors.text.secondary }]}>Días para vencer</Text>
            <SegmentedControl items={DAYS} value={String(values.days)} onChange={(value) => patch({ days: Number(value) })} />
          </View>
        ) : null}

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Buscar cuota</Text>
          <SearchField
            value={values.search}
            onChangeText={(search) => patch({ search })}
            placeholder="Negocio, cliente o documento"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Municipio</Text>
          <SearchField
            value={searchMunicipio}
            onChangeText={(value) => patch({ searchMunicipio: value })}
            placeholder={selectedMunicipio?.nombre || 'Todos los municipios'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={[styles.options, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !values.municipioId }}
              onPress={() => patch({ municipioId: '', searchMunicipio: '' })}
              style={[styles.option, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.optionText, { color: colors.primary.main, fontWeight: '700' }]}>Todos los municipios</Text>
              {!values.municipioId ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
            </Pressable>
            {available.map((municipio, index) => {
              const selected = values.municipioId === municipio.id;
              return (
                <Pressable
                  key={municipio.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ municipioId: municipio.id, searchMunicipio: municipio.nombre })}
                  style={[styles.option, index === available.length - 1 && styles.lastOption, { borderBottomColor: colors.divider }]}>
                  <Text style={[styles.optionText, { color: colors.text.primary }]}>{municipio.nombre}</Text>
                  {selected ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
                </Pressable>
              );
            })}
            {!available.length ? (
              <Text style={[styles.emptyOption, { color: colors.text.secondary }]}>Sin municipios para “{searchMunicipio}”</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Vencimiento</Text>
          <View style={styles.dates}>
            <View style={styles.date}>
              <NegocioDatePicker
                value={values.dueFrom}
                onChange={(value) => patch({ dueFrom: value })}
                colors={colors}
                label="Desde"
                accessibilityLabel="Vence desde"
              />
            </View>
            <View style={styles.date}>
              <NegocioDatePicker
                value={values.dueTo}
                onChange={(value) => patch({ dueTo: value })}
                colors={colors}
                label="Hasta"
                accessibilityLabel="Vence hasta"
              />
            </View>
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Vendedor del negocio</Text>
          <SearchField
            value={searchSeller}
            onChangeText={(value) => patch({ searchSeller: value })}
            placeholder={selectedSeller?.full_name || 'Todos los vendedores'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={[styles.options, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !values.sellerId }}
              onPress={() => patch({ sellerId: '', searchSeller: '' })}
              style={[styles.option, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.optionText, { color: colors.primary.main, fontWeight: '700' }]}>Todos los vendedores</Text>
              {!values.sellerId ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
            </Pressable>
            {availableSellers.map((seller, index) => {
              const selected = values.sellerId === seller.id;
              return (
                <Pressable
                  key={seller.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ sellerId: seller.id, searchSeller: seller.full_name })}
                  style={[styles.option, index === availableSellers.length - 1 && styles.lastOption, { borderBottomColor: colors.divider }]}>
                  <Text style={[styles.optionText, { color: colors.text.primary }]}>{seller.full_name}</Text>
                  {selected ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
                </Pressable>
              );
            })}
            {!availableSellers.length ? (
              <Text style={[styles.emptyOption, { color: colors.text.secondary }]}>
                {sellers.length ? `Sin vendedores para “${searchSeller}”` : 'Sin conexión: la lista de vendedores no está disponible'}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Vendedor del cliente</Text>
          <SearchField
            value={searchCustomerSeller}
            onChangeText={(value) => patch({ searchCustomerSeller: value })}
            placeholder={selectedCustomerSeller?.full_name || 'Todos los clientes'}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={[styles.options, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !values.customerSellerId }}
              onPress={() => patch({ customerSellerId: '', searchCustomerSeller: '' })}
              style={[styles.option, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.optionText, { color: colors.primary.main, fontWeight: '700' }]}>Todos los clientes</Text>
              {!values.customerSellerId ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
            </Pressable>
            {availableCustomerSellers.map((seller, index) => {
              const selected = values.customerSellerId === seller.id;
              return (
                <Pressable
                  key={seller.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ customerSellerId: seller.id, searchCustomerSeller: seller.full_name })}
                  style={[styles.option, index === availableCustomerSellers.length - 1 && styles.lastOption, { borderBottomColor: colors.divider }]}>
                  <Text style={[styles.optionText, { color: colors.text.primary }]}>{seller.full_name}</Text>
                  {selected ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
                </Pressable>
              );
            })}
            {!availableCustomerSellers.length ? (
              <Text style={[styles.emptyOption, { color: colors.text.secondary }]}>
                {sellers.length ? `Sin vendedores para “${searchCustomerSeller}”` : 'Sin conexión: la lista de vendedores no está disponible'}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={[styles.label, { color: colors.text.secondary }]}>Método de pago</Text>
          <View style={[styles.options, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !values.paymentMethodId }}
              onPress={() => patch({ paymentMethodId: '' })}
              style={[styles.option, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.optionText, { color: colors.primary.main, fontWeight: '700' }]}>Todos los métodos</Text>
              {!values.paymentMethodId ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
            </Pressable>
            {paymentMethods.map((method, index) => {
              const selected = values.paymentMethodId === method.id;
              return (
                <Pressable
                  key={method.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => patch({ paymentMethodId: method.id })}
                  style={[styles.option, index === paymentMethods.length - 1 && styles.lastOption, { borderBottomColor: colors.divider }]}>
                  <Text style={[styles.optionText, { color: colors.text.primary }]}>{method.name}</Text>
                  {selected ? <MaterialIcons name="check" size={20} color={colors.primary.main} /> : null}
                </Pressable>
              );
            })}
            {!paymentMethods.length ? (
              <Text style={[styles.emptyOption, { color: colors.text.secondary }]}>Sin métodos de pago disponibles</Text>
            ) : null}
          </View>
          {values.paymentMethodId ? (
            <Text style={[styles.emptyOption, { color: colors.text.secondary }]}>
              Solo negocios que registran abonos con ese método.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </FullScreenModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.xl, gap: Spacing.xl, paddingBottom: Spacing.xxl },
  dates: { flexDirection: 'row', gap: Spacing.sm },
  date: { flex: 1 },
  group: { gap: Spacing.sm },
  label: { ...Typography.label },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
  chipText: { ...Typography.bodySmallStrong },
  pressed: { opacity: 0.8 },
  options: { borderWidth: 1, borderRadius: Radius.control, overflow: 'hidden' },
  option: { minHeight: 48, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  lastOption: { borderBottomWidth: 0 },
  optionText: { ...Typography.bodySmall, flex: 1 },
  emptyOption: { ...Typography.caption, padding: Spacing.lg, fontStyle: 'italic' },
  footerButton: { flex: 1 },
});
