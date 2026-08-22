import { useEffect, useMemo, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildNegocioReceiptHtml } from '@/lib/negocioReceiptHtml';
import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { formatPaymentDateTime } from '@/lib/localDate';
import { NegocioDatePicker } from '@/components/negocios/components/NegocioDatePicker';
import {
  fetchManagerBusinesses,
  fetchManagerPayments,
  type CollectionManager,
  type ManagerBusiness,
  type ManagerPayment,
} from '@/lib/cartera/carteraService';
import { exportAndShareManagerPaymentsCsv } from '@/lib/cartera/exportManagerPaymentsCsv';
import { openPagoSupport } from '@/lib/uploadPagoSupport';
import { useBluetoothPrinter } from '@/components/printing';

const BUSINESS_PAGE_SIZE = 15;

export function CollectionManagerPaymentsModal({
  visible,
  manager,
  colors,
  onClose,
  onOpenBusiness,
}: {
  visible: boolean;
  manager: CollectionManager | null;
  colors: any;
  onClose: () => void;
  onOpenBusiness: (id: string) => void;
}) {
  const managerId = manager?.id || '';
  const [scope, setScope] = useState<'performed' | 'portfolio'>('performed');
  const [businesses, setBusinesses] = useState<ManagerBusiness[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [businessOpen, setBusinessOpen] = useState(false);
  const [businessSearch, setBusinessSearch] = useState('');
  const [businessVisibleCount, setBusinessVisibleCount] = useState(BUSINESS_PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'todos' | 'emitido' | 'anulado'>('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const insets = useSafeAreaInsets();
  const { printPayment, printing: printingTicket } = useBluetoothPrinter();

  useEffect(() => {
    if (!visible || !managerId) return;
    setData(null);
    setScope('performed');
    setBusinessId('');
    setBusinessOpen(false);
    setBusinessSearch('');
    setBusinessVisibleCount(BUSINESS_PAGE_SIZE);
    setSearch('');
    setStatus('todos');
    setDateFrom('');
    setDateTo('');
    setPage(1);
    fetchManagerBusinesses(managerId)
      .then(setBusinesses)
      .catch((e) => Alert.alert('Error', e.message));
  }, [visible, managerId]);

  useEffect(() => {
    if (!visible || !managerId || (dateFrom && dateTo && dateFrom > dateTo)) return;
    setLoading(true);
    fetchManagerPayments(managerId, {
      scope,
      negocioId: businessId,
      dateFrom,
      dateTo,
      receiptStatus: status,
      search,
      page,
      pageSize: 10,
    })
      .then(setData)
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [visible, managerId, scope, businessId, dateFrom, dateTo, status, search, page]);

  const options = useMemo(
    () => scope === 'portfolio'
      ? businesses.filter((business) => business.current_assignment)
      : businesses,
    [businesses, scope],
  );
  const filteredBusinessOptions = useMemo(() => {
    const term = businessSearch.trim().toLocaleLowerCase('es');
    if (!term) return options;

    return options.filter((business) =>
      [
        business.customer_name,
        business.customer_id_number || '',
        String(business.negocio_numero),
        formatNegocioCodigo(business.negocio_numero),
      ].some((value) => value.toLocaleLowerCase('es').includes(term)),
    );
  }, [businessSearch, options]);
  const visibleBusinessOptions = filteredBusinessOptions.slice(0, businessVisibleCount);

  const shareReceipt = async (payment: ManagerPayment) => {
    try {
      const html = buildNegocioReceiptHtml({
        receiptNumber: payment.virtual_receipt_number,
        status: payment.receipt_status,
        paidAt: payment.paid_at,
        amount: Number(payment.amount),
        physicalReceiptNumber: payment.receipt_number,
        negocioNumero: payment.negocio_numero,
        customerName: payment.customer_name,
        sellerName: payment.created_by_name,
        remainingBalance: Number(payment.remaining_balance),
      });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: payment.virtual_receipt_number,
        });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No fue posible compartir el recibo');
    }
  };

  const printReceipt = async (payment: ManagerPayment) => {
    await printPayment({
      receiptNumber: payment.virtual_receipt_number,
      status: payment.receipt_status,
      paidAt: payment.paid_at,
      amount: Number(payment.amount),
      physicalReceiptNumber: payment.receipt_number,
      negocioNumero: payment.negocio_numero,
      customerName: payment.customer_name,
      sellerName: payment.created_by_name,
      remainingBalance: Number(payment.remaining_balance),
    });
  };

  const exportCsv = async () => {
    if (!manager) return;
    if (dateFrom && dateTo && dateFrom > dateTo) {
      Alert.alert('Error', 'Corrige el rango de fechas antes de exportar');
      return;
    }
    setExporting(true);
    try {
      const { rowCount, fileName } = await exportAndShareManagerPaymentsCsv({
        manager,
        filters: {
          scope,
          negocioId: businessId,
          dateFrom,
          dateTo,
          receiptStatus: status,
          search,
        },
      });
      Alert.alert(
        'Reporte listo',
        rowCount
          ? `Se compartió ${fileName} (${rowCount} cobros).`
          : `Se compartió ${fileName} sin cobros.`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No fue posible exportar el reporte');
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;
  const selectedBusiness = options.find((b) => b.negocio_id === businessId);
  const selectBusiness = (nextBusinessId: string) => {
    setBusinessId(nextBusinessId);
    setBusinessOpen(false);
    setBusinessSearch('');
    setBusinessVisibleCount(BUSINESS_PAGE_SIZE);
    setPage(1);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background.default,
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={[styles.header, { borderBottomColor: colors.divider }]}>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={[styles.backButton, { backgroundColor: colors.background.paper }]}
            accessibilityRole="button"
            accessibilityLabel="Volver a cartera"
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
          </Pressable>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
              Cobros de {manager?.full_name || 'gestor'}
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              Historial y cartera asignada
            </Text>
          </View>
          <Pressable
            onPress={() => void exportCsv()}
            disabled={!manager || exporting || loading}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityLabel="Descargar reporte Excel CSV"
          >
            {exporting ? (
              <ActivityIndicator size="small" color={colors.primary.main} />
            ) : (
              <MaterialIcons name="file-download" size={24} color={colors.primary.main} />
            )}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.segment}>
            <Pressable
              onPress={() => {
                setScope('performed');
                setBusinessId('');
                setPage(1);
              }}
              style={[
                styles.segmentButton,
                {
                  backgroundColor:
                    scope === 'performed' ? colors.primary.main : colors.background.paper,
                  borderColor: colors.divider,
                },
              ]}
            >
              <Text
                style={{
                  color:
                    scope === 'performed'
                      ? colors.primary.contrastText
                      : colors.text.primary,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                Registrados por él
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setScope('portfolio');
                setBusinessId('');
                setPage(1);
              }}
              style={[
                styles.segmentButton,
                {
                  backgroundColor:
                    scope === 'portfolio' ? colors.primary.main : colors.background.paper,
                  borderColor: colors.divider,
                },
              ]}
            >
              <Text
                style={{
                  color:
                    scope === 'portfolio'
                      ? colors.primary.contrastText
                      : colors.text.primary,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                De negocios asignados
              </Text>
            </Pressable>
          </View>
          <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
            {scope === 'performed'
              ? `Pagos registrados personalmente por ${manager?.full_name || 'el gestor'}.`
              : 'Pagos de negocios asignados actualmente, aunque los haya registrado otro usuario.'}
          </Text>
          <Pressable
            onPress={() => void exportCsv()}
            disabled={!manager || exporting || loading}
            style={[
              styles.exportButton,
              {
                backgroundColor: colors.primary.main,
                opacity: !manager || exporting || loading ? 0.6 : 1,
              },
            ]}
          >
            {exporting ? (
              <ActivityIndicator color={colors.primary.contrastText} />
            ) : (
              <MaterialIcons
                name="file-download"
                size={18}
                color={colors.primary.contrastText}
              />
            )}
            <Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>
              {exporting ? 'Generando reporte...' : 'Descargar Excel (CSV)'}
            </Text>
          </Pressable>
          <View style={styles.metrics}>
            <Metric
              label="Recaudo neto"
              value={formatCOP(Number(summary?.total_collected || 0))}
              colors={colors}
            />
            <Metric label="Vigentes" value={String(summary?.valid_count || 0)} colors={colors} />
            <Metric
              label="Anulados"
              value={String(summary?.voided_count || 0)}
              colors={colors}
              error
            />
            <Metric
              label="Promedio"
              value={formatCOP(Number(summary?.average_payment || 0))}
              colors={colors}
            />
          </View>
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar cliente, recibo o negocio"
            placeholderTextColor={colors.text.secondary}
            style={[
              styles.input,
              {
                borderColor: colors.divider,
                color: colors.text.primary,
                backgroundColor: colors.background.paper,
              },
            ]}
          />
          <Pressable
            onPress={() => {
              setBusinessSearch('');
              setBusinessVisibleCount(BUSINESS_PAGE_SIZE);
              setBusinessOpen(true);
            }}
            style={[
              styles.select,
              { borderColor: colors.divider, backgroundColor: colors.background.paper },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Seleccionar negocio relacionado"
            accessibilityState={{ expanded: businessOpen }}
          >
            <Text style={{ color: colors.text.primary, flex: 1 }} numberOfLines={1}>
              {selectedBusiness
                ? `${formatNegocioCodigo(selectedBusiness.negocio_numero)} · ${selectedBusiness.customer_name}`
                : 'Todos los negocios relacionados'}
            </Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.text.secondary} />
          </Pressable>
          <View style={styles.filters}>
            <View style={styles.date}>
              <NegocioDatePicker
                value={dateFrom}
                onChange={(v) => {
                  setDateFrom(v);
                  setPage(1);
                }}
                colors={colors}
                label="Desde"
                accessibilityLabel="Fecha inicial"
              />
            </View>
            <View style={styles.date}>
              <NegocioDatePicker
                value={dateTo}
                onChange={(v) => {
                  setDateTo(v);
                  setPage(1);
                }}
                colors={colors}
                label="Hasta"
                accessibilityLabel="Fecha final"
              />
            </View>
          </View>
          <View style={styles.statuses}>
            {(['todos', 'emitido', 'anulado'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  setStatus(s);
                  setPage(1);
                }}
                style={[
                  styles.status,
                  {
                    borderColor: colors.divider,
                    backgroundColor:
                      status === s ? colors.primary.main : colors.background.paper,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      status === s ? colors.primary.contrastText : colors.text.primary,
                    fontWeight: '600',
                  }}
                >
                  {s === 'todos' ? 'Todos' : s === 'emitido' ? 'Vigentes' : 'Anulados'}
                </Text>
              </Pressable>
            ))}
          </View>
          {dateFrom && dateTo && dateFrom > dateTo && (
            <Text style={{ color: colors.error.main }}>
              La fecha inicial debe ser anterior a la final.
            </Text>
          )}
          {loading ? (
            <ActivityIndicator color={colors.primary.main} style={{ margin: 25 }} />
          ) : data?.rows?.length ? (
            data.rows.map((p: ManagerPayment) => (
              <View
                key={p.payment_id}
                style={[
                  styles.payment,
                  {
                    backgroundColor: colors.background.paper,
                    borderColor: colors.divider,
                  },
                ]}
              >
                <Pressable onPress={() => onOpenBusiness(p.negocio_id)} style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, fontWeight: '700' }}>
                    {formatNegocioCodigo(p.negocio_numero)} · {p.customer_name}
                  </Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                    {formatPaymentDateTime(p.paid_at)} ·{' '}
                    {p.installment_number
                      ? `Cuota ${p.installment_number}`
                      : 'Auto (FIFO)'}
                  </Text>
                  <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
                    {p.virtual_receipt_number} · {p.created_by_name}
                  </Text>
                </Pressable>
                <View style={{ alignItems: 'flex-end', gap: 5 }}>
                  <Text style={{ color: colors.text.primary, fontWeight: '700' }}>
                    {formatCOP(Number(p.amount))}
                  </Text>
                  <Text
                    style={{
                      color:
                        p.receipt_status === 'anulado'
                          ? colors.error.main
                          : colors.success.main,
                      fontSize: 12,
                      fontWeight: '700',
                    }}
                  >
                    {p.receipt_status === 'anulado' ? 'Anulado' : 'Vigente'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {p.support_path ? (
                      <Pressable
                        onPress={() => {
                          void openPagoSupport(p.support_path!).catch((error: any) =>
                            Alert.alert(
                              'Error',
                              error?.message || 'No se pudo abrir el soporte'
                            )
                          );
                        }}
                      >
                        <MaterialIcons
                          name="attach-file"
                          size={22}
                          color={colors.primary.main}
                        />
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => shareReceipt(p)}>
                      <MaterialIcons
                        name="picture-as-pdf"
                        size={22}
                        color={colors.primary.main}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => void printReceipt(p)}
                      disabled={printingTicket}
                    >
                      <MaterialIcons
                        name="print"
                        size={22}
                        color={colors.primary.main}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.empty, { color: colors.text.secondary }]}>
              No hay cobros para estos filtros.
            </Text>
          )}
          <View style={styles.pager}>
            <Pressable disabled={page === 1} onPress={() => setPage((p) => p - 1)}>
              <Text
                style={{
                  color: page === 1 ? colors.text.secondary : colors.primary.main,
                  fontWeight: '700',
                }}
              >
                Anterior
              </Text>
            </Pressable>
            <Text style={{ color: colors.text.secondary }}>
              Página {page} · {summary?.total_count || 0} registros
            </Text>
            <Pressable
              disabled={!data || page * 10 >= Number(summary?.total_count || 0)}
              onPress={() => setPage((p) => p + 1)}
            >
              <Text
                style={{
                  color:
                    !data || page * 10 >= Number(summary?.total_count || 0)
                      ? colors.text.secondary
                      : colors.primary.main,
                  fontWeight: '700',
                }}
              >
                Siguiente
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        {businessOpen ? (
          <View style={styles.businessPickerOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setBusinessOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar selector de negocios"
            />
            <KeyboardAvoidingView
              style={styles.businessPickerKeyboard}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              pointerEvents="box-none"
            >
              <View
                style={[
                  styles.businessPickerSheet,
                  {
                    backgroundColor: colors.background.paper,
                    borderColor: colors.divider,
                    marginBottom: Math.max(insets.bottom, 8),
                  },
                ]}
              >
                <View style={[styles.businessPickerHeader, { borderBottomColor: colors.divider }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.businessPickerTitle, { color: colors.text.primary }]}>Seleccionar negocio</Text>
                    <Text style={[styles.businessPickerCount, { color: colors.text.secondary }]}>Mostrando {visibleBusinessOptions.length} de {filteredBusinessOptions.length}</Text>
                  </View>
                  <Pressable
                    onPress={() => setBusinessOpen(false)}
                    style={styles.closeButton}
                    accessibilityRole="button"
                    accessibilityLabel="Cerrar selector de negocios"
                  >
                    <MaterialIcons name="close" size={25} color={colors.text.primary} />
                  </Pressable>
                </View>

                <View style={[styles.businessSearchContainer, { backgroundColor: colors.background.default, borderColor: colors.divider }]}>
                  <MaterialIcons name="search" size={20} color={colors.text.secondary} />
                  <TextInput
                    value={businessSearch}
                    onChangeText={(value) => {
                      setBusinessSearch(value);
                      setBusinessVisibleCount(BUSINESS_PAGE_SIZE);
                    }}
                    placeholder="Buscar cliente, identificación o negocio"
                    placeholderTextColor={colors.text.secondary}
                    style={[styles.businessSearchInput, { color: colors.text.primary }]}
                    accessibilityLabel="Buscar negocio relacionado"
                  />
                  {businessSearch ? (
                    <Pressable
                      onPress={() => setBusinessSearch('')}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Limpiar búsqueda de negocio"
                    >
                      <MaterialIcons name="close" size={20} color={colors.text.secondary} />
                    </Pressable>
                  ) : null}
                </View>

                <FlatList
                  data={visibleBusinessOptions}
                  keyExtractor={(item) => item.negocio_id}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.businessListContent}
                  ListHeaderComponent={
                    <Pressable
                      onPress={() => selectBusiness('')}
                      style={[
                        styles.businessOption,
                        { borderBottomColor: colors.divider },
                        !businessId && { backgroundColor: colors.surface?.muted || colors.background.default },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: !businessId }}
                    >
                      <View style={styles.businessOptionCopy}>
                        <Text style={[styles.businessOptionTitle, { color: colors.text.primary }]}>Todos los negocios relacionados</Text>
                        <Text style={[styles.businessOptionMeta, { color: colors.text.secondary }]}>{filteredBusinessOptions.length} disponibles</Text>
                      </View>
                      {!businessId ? <MaterialIcons name="check-circle" size={22} color={colors.primary.main} /> : null}
                    </Pressable>
                  }
                  renderItem={({ item }) => {
                    const selected = businessId === item.negocio_id;
                    return (
                      <Pressable
                        onPress={() => selectBusiness(item.negocio_id)}
                        style={[
                          styles.businessOption,
                          { borderBottomColor: colors.divider },
                          selected && { backgroundColor: colors.surface?.muted || colors.background.default },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                      >
                        <View style={styles.businessOptionCopy}>
                          <Text style={[styles.businessOptionTitle, { color: colors.text.primary }]} numberOfLines={1}>{formatNegocioCodigo(item.negocio_numero)} · {item.customer_name}</Text>
                          <Text style={[styles.businessOptionMeta, { color: colors.text.secondary }]}>{item.customer_id_number ? `${item.customer_id_number} · ` : ''}{item.current_assignment ? 'Asignación actual' : 'Asignación histórica'}</Text>
                        </View>
                        {selected ? <MaterialIcons name="check-circle" size={22} color={colors.primary.main} /> : <MaterialIcons name="chevron-right" size={22} color={colors.text.secondary} />}
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.businessEmpty}>
                      <MaterialIcons name="search-off" size={32} color={colors.text.secondary} />
                      <Text style={{ color: colors.text.secondary }}>No se encontraron negocios</Text>
                    </View>
                  }
                  ListFooterComponent={
                    filteredBusinessOptions.length > visibleBusinessOptions.length ? (
                      <Pressable
                        onPress={() => setBusinessVisibleCount((count) => count + BUSINESS_PAGE_SIZE)}
                        style={[styles.businessLoadMore, { borderColor: colors.divider }]}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.primary.main, fontWeight: '700' }}>Cargar {Math.min(BUSINESS_PAGE_SIZE, filteredBusinessOptions.length - visibleBusinessOptions.length)} más</Text>
                        <MaterialIcons name="expand-more" size={20} color={colors.primary.main} />
                      </Pressable>
                    ) : visibleBusinessOptions.length ? (
                      <Text style={[styles.businessEnd, { color: colors.text.secondary }]}>Todos los negocios encontrados están visibles</Text>
                    ) : null
                  }
                />
              </View>
            </KeyboardAvoidingView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function Metric({
  label,
  value,
  colors,
  error,
}: {
  label: string;
  value: string;
  colors: any;
  error?: boolean;
}) {
  return (
    <View
      style={[
        styles.metric,
        { backgroundColor: colors.background.paper, borderColor: colors.divider },
      ]}
    >
      <Text style={{ color: colors.text.secondary, fontSize: 10 }}>{label}</Text>
      <Text
        style={{
          color: error ? colors.error.main : colors.text.primary,
          fontWeight: '700',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    marginRight: 10,
  },
  title: { fontSize: 18, fontWeight: '700' },
  content: { padding: 14, gap: 10 },
  segment: { flexDirection: 'row', gap: 6 },
  segmentButton: { flex: 1, padding: 10, alignItems: 'center', borderWidth: 1, borderRadius: 8 },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '48%', borderWidth: 1, borderRadius: 8, padding: 9 },
  input: { borderWidth: 1, borderRadius: 9, padding: 11 },
  select: {
    borderWidth: 1,
    borderRadius: 9,
    padding: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filters: { flexDirection: 'row', gap: 8 },
  date: { flex: 1 },
  statuses: { flexDirection: 'row', gap: 7 },
  status: { paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderRadius: 16 },
  payment: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
  },
  empty: { textAlign: 'center', marginVertical: 30 },
  pager: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  businessPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    elevation: 20,
    zIndex: 1000,
  },
  businessPickerKeyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  businessPickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    height: '74%',
    maxHeight: 640,
    overflow: 'hidden',
  },
  businessPickerHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 16,
  },
  businessPickerTitle: {
    fontSize: 19,
    fontWeight: '800',
  },
  businessPickerCount: {
    fontSize: 12,
    marginTop: 2,
  },
  businessSearchContainer: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    margin: 14,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  businessSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  businessListContent: {
    paddingBottom: 14,
  },
  businessOption: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  businessOptionCopy: {
    flex: 1,
    marginRight: 10,
  },
  businessOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  businessOptionMeta: {
    fontSize: 11,
    marginTop: 3,
  },
  businessEmpty: {
    alignItems: 'center',
    gap: 8,
    padding: 32,
  },
  businessLoadMore: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    margin: 14,
    minHeight: 48,
  },
  businessEnd: {
    fontSize: 12,
    padding: 18,
    textAlign: 'center',
  },
});
