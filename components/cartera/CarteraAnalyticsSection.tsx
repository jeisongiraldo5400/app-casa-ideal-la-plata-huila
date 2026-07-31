import { useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatCOP } from '@/lib/creditCalculator';
import type { CarteraDashboard } from '@/lib/cartera/carteraService';

export function CarteraAnalyticsSection({ data, colors, onOpenBusiness }: { data: CarteraDashboard | null; colors: any; onOpenBusiness: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const summary = data.summary;
  const money = (key: string) => formatCOP(Number(summary[key] || 0));
  const alerts = Object.entries(data.alerts || {}).filter(([, value]) => Number(value) > 0);
  const aging = data.aging.map((item) => ({ value: Number(item.balance), label: item.label.replace(' días', 'd'), frontColor: colors.error.main }));
  const monthly = data.monthly.slice(-6);
  const collected = monthly.map((item) => ({ value: Number(item.collected), label: item.month.slice(5), dataPointText: '' }));
  return <View style={[styles.wrap, { borderColor: colors.divider, backgroundColor: colors.background.paper }]}>
    <Pressable onPress={() => setOpen((value) => !value)} style={styles.head}>
      <View><Text style={[styles.title, { color: colors.text.primary }]}>Análisis de cartera</Text><Text style={{ color: colors.text.secondary, fontSize:12 }}>Mora, recaudo y gestión</Text></View>
      <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={26} color={colors.primary.main} />
    </Pressable>
    {open && <View style={styles.content}>
      <View style={styles.upcoming}><Mini label="Vence en 7 días" value={money('upcoming_7')} colors={colors}/><Mini label="Vence en 15 días" value={money('upcoming_15')} colors={colors}/><Mini label="Vence en 30 días" value={money('upcoming_30')} colors={colors}/></View>
      {alerts.length > 0 && <><Text style={[styles.subtitle, { color: colors.text.primary }]}>Alertas</Text><View style={styles.alerts}>{alerts.map(([key,value]) => <View key={key} style={[styles.alert,{ backgroundColor: colors.error.light + '22' }]}><Text style={{ color: colors.error.main, fontWeight:'700' }}>{value}</Text><Text style={{ color: colors.text.secondary, fontSize:11 }}>{labelAlert(key)}</Text></View>)}</View></>}
      <Text style={[styles.subtitle,{ color:colors.text.primary }]}>Antigüedad de cartera vencida</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><BarChart data={aging} width={Math.max(360, aging.length*78)} height={190} barWidth={28} spacing={34} hideRules yAxisTextStyle={{color:colors.text.secondary,fontSize:10}} xAxisLabelTextStyle={{color:colors.text.secondary,fontSize:10}} noOfSections={3} /></ScrollView>
      <Text style={[styles.subtitle,{ color:colors.text.primary }]}>Recaudo mensual</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><LineChart data={collected} width={Math.max(330, collected.length*58)} height={180} color={colors.success.main} thickness={3} hideRules yAxisTextStyle={{color:colors.text.secondary,fontSize:10}} xAxisLabelTextStyle={{color:colors.text.secondary,fontSize:10}} /></ScrollView>
      <Text style={[styles.subtitle,{ color:colors.text.primary }]}>Negocios críticos</Text>
      {data.critical_businesses.slice(0,5).map((business) => <Pressable onPress={() => onOpenBusiness(business.id)} key={business.id} style={[styles.business,{borderBottomColor:colors.divider}]}><View><Text style={{color:colors.text.primary,fontWeight:'700'}}>#{business.numero} · {business.customer_name}</Text><Text style={{color:colors.error.main,fontSize:12}}>{business.overdue_days} días de atraso · {business.overdue_installments} cuotas</Text></View><Text style={{color:colors.text.primary,fontWeight:'700'}}>{formatCOP(Number(business.overdue_balance))}</Text></Pressable>)}
      <Text style={[styles.subtitle,{ color:colors.text.primary }]}>Riesgo por municipio</Text>
      {data.municipalities.slice(0,5).map((item) => <View key={item.municipality_id || 'none'} style={styles.rank}><Text style={{color:colors.text.primary}}>{item.municipality_name}</Text><Text style={{color:colors.error.main,fontWeight:'700'}}>{formatCOP(Number(item.overdue_balance))} · {Number(item.overdue_rate).toFixed(1)}%</Text></View>)}
      {data.managers.length > 0 && <><Text style={[styles.subtitle,{ color:colors.text.primary }]}>Rendimiento por gestor</Text>{data.managers.slice(0,5).map((item) => <View key={item.gestor_cobro_id} style={styles.rank}><View><Text style={{color:colors.text.primary,fontWeight:'600'}}>{item.manager_name}</Text><Text style={{color:colors.text.secondary,fontSize:11}}>{item.assigned_businesses} negocios · Cumplimiento {Number(item.collection_compliance).toFixed(1)}%</Text></View><Text style={{color:colors.success.main,fontWeight:'700'}}>{formatCOP(Number(item.collected_month))}</Text></View>)}</>}
      {data.customer_concentration.length > 0 && <><Text style={[styles.subtitle,{ color:colors.text.primary }]}>Mayor saldo por cliente</Text>{data.customer_concentration.slice(0,5).map((item) => <View key={item.customer_id} style={styles.rank}><Text style={{color:colors.text.primary}} numberOfLines={1}>{item.customer_name}</Text><Text style={{color:colors.text.primary,fontWeight:'700'}}>{formatCOP(Number(item.balance))}</Text></View>)}</>}
    </View>}
  </View>;
}
function Mini({label,value,colors}:{label:string;value:string;colors:any}) { return <View style={[styles.mini,{backgroundColor:colors.background.default}]}><Text style={{color:colors.text.secondary,fontSize:10}}>{label}</Text><Text style={{color:colors.text.primary,fontWeight:'700',fontSize:12}}>{value}</Text></View>; }
function labelAlert(key:string) { return ({ without_manager:'sin gestor',without_phone:'sin teléfono',multiple_overdue:'varias vencidas',without_payment_30_days:'sin pago +30d',due_today:'vencen hoy',voided_payments_month:'pagos anulados' } as Record<string,string>)[key] || key; }
const styles=StyleSheet.create({wrap:{borderWidth:1,borderRadius:12,marginBottom:12,overflow:'hidden'},head:{padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},title:{fontSize:16,fontWeight:'700'},content:{padding:14,paddingTop:0,gap:10},upcoming:{flexDirection:'row',gap:6},mini:{flex:1,padding:8,borderRadius:8},subtitle:{fontWeight:'700',marginTop:8},alerts:{flexDirection:'row',flexWrap:'wrap',gap:6},alert:{padding:8,borderRadius:8,minWidth:'30%'},business:{paddingVertical:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1},rank:{paddingVertical:5,flexDirection:'row',justifyContent:'space-between',gap:8}});
