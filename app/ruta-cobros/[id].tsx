import { RouteRoadmap } from '@/components/collection-routes/RouteRoadmap';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import {
  fetchCollectionRoute,
  finishCollectionRoute,
  startCollectionRoute,
  updateCollectionRouteStop,
} from '@/lib/collection-routes/collectionRouteService';
import { getRouteProgress } from '@/lib/collection-routes/routeState';
import { CollectionRoute, CollectionRouteStop, StopStatus } from '@/lib/collection-routes/types';
import { getCachedActiveRoute } from '@/lib/collection-routes/routeCache';
import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const money = (value: number) => `$ ${Math.round(value).toLocaleString('es-CO')}`;

export default function CollectionRouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isDark } = useTheme();
  const colors = getColors(isDark);
  const [route, setRoute] = useState<CollectionRoute | null>(null);
  const [selectedStop, setSelectedStop] = useState<CollectionRouteStop | null>(null);
  const [outcome, setOutcome] = useState<Extract<StopStatus, 'sin_pago' | 'reprogramado' | 'omitido'> | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setRoute(await fetchCollectionRoute(id)); }
    catch (e: any) {
      const cached = await getCachedActiveRoute();
      if (cached?.id === id) setRoute(cached);
      else Alert.alert('No fue posible cargar la ruta', e.message);
    }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (action: () => Promise<void>, success?: string) => {
    try { setSaving(true); await action(); if (success) Alert.alert('Listo', success); setSelectedStop(null); setOutcome(null); setReason(''); setNotes(''); await load(); }
    catch (e: any) { Alert.alert('No se pudo completar la acción', e.message); }
    finally { setSaving(false); }
  };

  if (loading || !route) return <View style={styles.center}><ActivityIndicator color={colors.primary.main} /></View>;
  const progress = getRouteProgress(route.stops);
  const allDone = progress.total > 0 && progress.completed === progress.total;
  const activeStop = route.stops.find((stop) => stop.status === 'actual');

  const confirmCancel = () => Alert.alert('Cancelar ruta', 'La ruta se conservará en el historial. ¿Deseas cancelarla?', [
    { text: 'No', style: 'cancel' },
    { text: 'Cancelar ruta', style: 'destructive', onPress: () => run(() => finishCollectionRoute(route.id, true), 'Ruta cancelada') },
  ]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.default }]}>
      <Stack.Screen options={{ headerShown: true, title: 'Ruta de cobros', headerStyle: { backgroundColor: colors.primary.main }, headerTintColor: '#fff' }} />
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={{ paddingBottom: 34 }}>
        <View style={[styles.summary, { backgroundColor: colors.primary.main }]}>
          <View style={styles.summaryTop}><View><Text style={styles.summaryEyebrow}>{route.status === 'activa' ? 'RUTA EN CURSO' : route.status.toUpperCase()}</Text><Text style={styles.summaryTitle}>{progress.completed} de {progress.total} visitas</Text></View><View style={styles.percent}><Text style={styles.percentText}>{progress.percentage}%</Text></View></View>
          <View style={styles.progressTrack}><View style={[styles.progressValue, { width: `${progress.percentage}%` }]} /></View>
          <View style={styles.moneyRow}><View><Text style={styles.moneyLabel}>Saldo en ruta</Text><Text style={styles.moneyValue}>{money(route.total_expected)}</Text></View><View><Text style={styles.moneyLabel}>Recaudado</Text><Text style={styles.moneyValue}>{money(route.total_collected)}</Text></View></View>
        </View>

        {route.status === 'borrador' && <View style={styles.actionBox}><Text style={[styles.actionTitle, { color: colors.text.primary }]}>Tu recorrido está preparado</Text><Text style={{ color: colors.text.secondary, textAlign: 'center' }}>Al iniciar, la primera parada quedará destacada.</Text><TouchableOpacity disabled={saving} style={[styles.primaryButton, { backgroundColor: colors.primary.main }]} onPress={() => run(() => startCollectionRoute(route.id), 'Ruta iniciada')}><MaterialIcons name="play-arrow" color="#fff" size={22} /><Text style={styles.buttonText}>Iniciar ruta</Text></TouchableOpacity></View>}

        {route.status === 'activa' && activeStop && <TouchableOpacity style={[styles.nextCard, { backgroundColor: colors.background.paper, borderColor: colors.primary.main }]} onPress={() => setSelectedStop(activeStop)}><View style={[styles.nextIcon, { backgroundColor: '#dbeafe' }]}><MaterialIcons name="near-me" size={25} color="#2563eb" /></View><View style={{ flex: 1 }}><Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '900' }}>PARADA ACTUAL</Text><Text style={[styles.actionTitle, { color: colors.text.primary }]}>{activeStop.customer_name}</Text><Text style={{ color: colors.text.secondary }} numberOfLines={1}>{activeStop.customer_address}</Text></View><MaterialIcons name="chevron-right" size={25} color={colors.text.secondary} /></TouchableOpacity>}

        <View style={styles.roadContainer}><RouteRoadmap stops={route.stops} onPressStop={setSelectedStop} /></View>

        {route.status === 'activa' && allDone && <TouchableOpacity disabled={saving} style={[styles.finishButton, { backgroundColor: colors.success.main }]} onPress={() => run(() => finishCollectionRoute(route.id), 'Ruta completada')}><MaterialIcons name="flag" color="#fff" size={21} /><Text style={styles.buttonText}>Completar jornada</Text></TouchableOpacity>}
        {(route.status === 'borrador' || route.status === 'activa') && <TouchableOpacity onPress={confirmCancel} style={styles.cancelButton}><Text style={{ color: colors.error.main, fontWeight: '800' }}>Cancelar esta ruta</Text></TouchableOpacity>}
      </ScrollView>

      <Modal transparent animationType="slide" visible={!!selectedStop} onRequestClose={() => setSelectedStop(null)}>
        <View style={styles.overlay}><View style={[styles.sheet, { backgroundColor: colors.background.paper }]}>
          <View style={styles.sheetHandle} />
          {selectedStop && <>
            <View style={styles.sheetHeader}><View><Text style={{ color: colors.primary.main, fontWeight: '900' }}>PARADA {selectedStop.position}</Text><Text style={[styles.sheetTitle, { color: colors.text.primary }]}>{selectedStop.customer_name}</Text><Text style={{ color: colors.text.secondary }}>Negocio #{selectedStop.negocio_numero}</Text></View><TouchableOpacity onPress={() => setSelectedStop(null)}><MaterialIcons name="close" size={26} color={colors.text.secondary} /></TouchableOpacity></View>
            <View style={[styles.infoBox, { backgroundColor: colors.background.default }]}><Text style={{ color: colors.text.secondary }}>{[selectedStop.customer_address, selectedStop.municipality_name].filter(Boolean).join(', ')}</Text><Text style={[styles.balance, { color: colors.text.primary }]}>{money(selectedStop.expected_balance)}</Text></View>
            {selectedStop.customer_phone && <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.divider }]} onPress={() => Linking.openURL(`tel:${selectedStop.customer_phone}`)}><MaterialIcons name="call" size={20} color={colors.primary.main} /><Text style={{ color: colors.primary.main, fontWeight: '800' }}>Llamar al cliente</Text></TouchableOpacity>}
            <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.divider }]} onPress={() => { setSelectedStop(null); router.push(`/negocio/${selectedStop.negocio_id}` as any); }}><MaterialIcons name="visibility" size={20} color={colors.primary.main} /><Text style={{ color: colors.primary.main, fontWeight: '800' }}>Ver negocio</Text></TouchableOpacity>
            {route.status === 'activa' && selectedStop.status === 'actual' && !outcome && <>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.success.main }]} onPress={() => { setSelectedStop(null); router.push(`/negocio/${selectedStop.negocio_id}?routeStopId=${selectedStop.id}` as any); }}><MaterialIcons name="payments" size={21} color="#fff" /><Text style={styles.buttonText}>Registrar cobro</Text></TouchableOpacity>
              <View style={styles.outcomeRow}><TouchableOpacity style={styles.outcomeButton} onPress={() => setOutcome('sin_pago')}><MaterialIcons name="money-off" size={20} color="#f59e0b" /><Text style={styles.outcomeText}>Sin pago</Text></TouchableOpacity><TouchableOpacity style={styles.outcomeButton} onPress={() => setOutcome('reprogramado')}><MaterialIcons name="event-repeat" size={20} color="#7c3aed" /><Text style={styles.outcomeText}>Reprogramar</Text></TouchableOpacity><TouchableOpacity style={styles.outcomeButton} onPress={() => setOutcome('omitido')}><MaterialIcons name="skip-next" size={20} color="#dc2626" /><Text style={styles.outcomeText}>Omitir</Text></TouchableOpacity></View>
            </>}
            {outcome && <View style={{ gap: 10 }}><Text style={[styles.actionTitle, { color: colors.text.primary }]}>Motivo de la novedad</Text><TextInput value={reason} onChangeText={setReason} placeholder="Motivo obligatorio" placeholderTextColor={colors.text.secondary} style={[styles.textInput, { color: colors.text.primary, borderColor: colors.divider }]} /><TextInput value={notes} onChangeText={setNotes} placeholder="Notas adicionales (opcional)" placeholderTextColor={colors.text.secondary} multiline style={[styles.textInput, { color: colors.text.primary, borderColor: colors.divider, minHeight: 70 }]} /><View style={styles.modalActions}><TouchableOpacity onPress={() => setOutcome(null)}><Text style={{ color: colors.text.secondary, fontWeight: '800' }}>Atrás</Text></TouchableOpacity><TouchableOpacity disabled={!reason.trim() || saving} style={[styles.saveOutcome, { backgroundColor: colors.primary.main, opacity: reason.trim() ? 1 : 0.5 }]} onPress={() => run(() => updateCollectionRouteStop(selectedStop.id, outcome, reason, notes))}><Text style={styles.buttonText}>Guardar novedad</Text></TouchableOpacity></View></View>}
          </>}
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, summary: { padding: 20, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 }, summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, summaryEyebrow: { color: '#bfdbfe', fontSize: 11, fontWeight: '900', letterSpacing: 1 }, summaryTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 3 }, percent: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }, percentText: { color: '#fff', fontWeight: '900' }, progressTrack: { height: 7, backgroundColor: '#ffffff30', borderRadius: 5, marginVertical: 15, overflow: 'hidden' }, progressValue: { height: '100%', backgroundColor: '#fff', borderRadius: 5 }, moneyRow: { flexDirection: 'row', justifyContent: 'space-between' }, moneyLabel: { color: '#bfdbfe', fontSize: 11 }, moneyValue: { color: '#fff', fontWeight: '900', fontSize: 16, marginTop: 2 }, actionBox: { alignItems: 'center', padding: 22, gap: 9 }, actionTitle: { fontSize: 17, fontWeight: '900' }, primaryButton: { minHeight: 48, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, marginTop: 8 }, buttonText: { color: '#fff', fontWeight: '900' }, nextCard: { margin: 16, marginBottom: 2, borderWidth: 1.5, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, nextIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, roadContainer: { paddingHorizontal: 13 }, finishButton: { marginHorizontal: 18, height: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, cancelButton: { alignItems: 'center', padding: 20 }, overlay: { flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' }, sheet: { borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 32, gap: 11 }, sheetHandle: { width: 46, height: 5, borderRadius: 3, backgroundColor: '#cbd5e1', alignSelf: 'center' }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between' }, sheetTitle: { fontSize: 22, fontWeight: '900', marginTop: 3 }, infoBox: { padding: 13, borderRadius: 12, gap: 7 }, balance: { fontSize: 19, fontWeight: '900' }, secondaryButton: { height: 45, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, outcomeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }, outcomeButton: { alignItems: 'center', gap: 4, padding: 8 }, outcomeText: { color: '#475569', fontSize: 11, fontWeight: '800' }, textInput: { borderWidth: 1, borderRadius: 12, padding: 12 }, modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 20 }, saveOutcome: { paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12 },
});
