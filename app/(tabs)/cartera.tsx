import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/components/theme';
import { getColors } from '@/constants/theme';
import { formatCOP } from '@/lib/creditCalculator';
import { formatNegocioCodigo } from '@/lib/negocioLabels';
import { CarteraAnalyticsSection } from '@/components/cartera/CarteraAnalyticsSection';
import { CarteraFilterModal } from '@/components/cartera/CarteraFilterModal';
import { CollectionManagerPaymentsModal } from '@/components/cartera/CollectionManagerPaymentsModal';
import { DownloadDataButton } from '@/components/offline';
import { fetchMunicipios, searchCollectionManagers, type CarteraDashboard, type CarteraFilter, type CarteraRow, type CollectionManager, type Municipio } from '@/lib/cartera/carteraService';
import { loadCarteraScreen } from '@/lib/cartera/loadCarteraScreen';
import { formatLocalDataLabel } from '@/lib/offline/sync/downloadData';
import { useSyncStore } from '@/lib/offline/store/syncStore';
import { useUserRoles } from '@/hooks/useUserRoles';

const PAGE_SIZE = 10;
type Filters = { filter: CarteraFilter; search: string; municipioId: string; days: number; searchMunicipio: string };
const INITIAL_FILTERS: Filters = { filter: 'todas', search: '', municipioId: '', days: 15, searchMunicipio: '' };

function daysOverdue(date: string) { const due=new Date(`${date}T12:00:00`); const today=new Date(); today.setHours(12,0,0,0); return Math.max(0,Math.floor((today.getTime()-due.getTime())/86400000)); }

export default function CarteraScreen() {
  const router=useRouter(); const {isDark}=useTheme(); const colors=getColors(isDark); const {isAdmin,isGestorCobro}=useUserRoles();
  const [filters,setFilters]=useState<Filters>(INITIAL_FILTERS); const [draftFilters,setDraftFilters]=useState<Filters>(INITIAL_FILTERS); const [filtersOpen,setFiltersOpen]=useState(false);
  const [rows,setRows]=useState<CarteraRow[]>([]); const [totalCount,setTotalCount]=useState(0); const [page,setPage]=useState(1); const [loading,setLoading]=useState(true); const [loadingMore,setLoadingMore]=useState(false); const [refreshing,setRefreshing]=useState(false);
  const [dashboard,setDashboard]=useState<CarteraDashboard|null>(null); const [municipios,setMunicipios]=useState<Municipio[]>([]);
  const [fromCache,setFromCache]=useState(false);
  const lastSyncedAt=useSyncStore((state)=>state.lastSyncedAt);
  const [managerPickerOpen,setManagerPickerOpen]=useState(false); const [managerSearch,setManagerSearch]=useState(''); const [managers,setManagers]=useState<CollectionManager[]>([]); const [selectedManager,setSelectedManager]=useState<CollectionManager|null>(null); const [managerModalOpen,setManagerModalOpen]=useState(false);

  const load=useCallback(async(target:number=1, reset:boolean=true)=>{
    if(reset)setLoading(true);else setLoadingMore(true);
    try {
      const result=await loadCarteraScreen({...filters,page:target,pageSize:PAGE_SIZE,includeDashboard:reset});
      setRows(current=>reset?result.rows:[...current,...result.rows]);
      setTotalCount(result.totalCount);
      setPage(target);
      setFromCache(result.fromCache);
      if(result.dashboard)setDashboard(result.dashboard);
    }catch(e:any){
      if(reset){setRows([]);setTotalCount(0);setFromCache(false);}
      Alert.alert('Cartera',e.message||'No fue posible cargar la información');
    }finally{setLoading(false);setLoadingMore(false);setRefreshing(false);}
  },[filters]);
  useFocusEffect(useCallback(()=>{void load(1,true);},[load]));
  useEffect(()=>{fetchMunicipios().then(setMunicipios).catch((e)=>console.warn(e.message));},[]);
  useEffect(()=>{const timer=setTimeout(()=>{searchCollectionManagers(managerSearch).then(setManagers).catch(()=>setManagers([]));},300);return()=>clearTimeout(timer);},[managerSearch]);
  const openFilters=()=>{setDraftFilters(filters);setFiltersOpen(true);};
  const applyFilters=()=>{setFilters(draftFilters);setFiltersOpen(false);};
  const showManager=()=>{if(isGestorCobro()&&!isAdmin()){Alert.alert('Mis cobros','Seleccione su usuario desde la lista de gestores disponible para su cuenta.');}setManagerSearch('');setManagerPickerOpen(true);};
  const summary=dashboard?.summary||{}; const primary=[['Cartera pendiente',formatCOP(Number(summary.total_balance||0)),colors.primary.main],['Cartera vencida',formatCOP(Number(summary.overdue_balance||0)),colors.error.main],['Recaudado mes',formatCOP(Number(summary.collected_month||0)),colors.success.main],['Cumplimiento',`${Number(summary.collection_compliance||0).toFixed(1)}%`,Number(summary.collection_compliance||0)>=90?colors.success.main:colors.warning.main]];
  return <View style={[styles.container,{backgroundColor:colors.background.default}]}> 
    <FlatList data={rows} keyExtractor={(item)=>item.cuota_id} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);void load(1,true);}}/>}
      ListHeaderComponent={<><View style={styles.top}><View><Text style={[styles.title,{color:colors.text.primary}]}>Cartera</Text><Text style={{color:colors.text.secondary,fontSize:12}}>{totalCount} cuotas abiertas</Text>{fromCache?<Text style={{color:colors.text.secondary,fontSize:12,marginTop:2}}>{formatLocalDataLabel(lastSyncedAt)}</Text>:null}</View><View style={styles.actions}><Pressable onPress={openFilters} style={[styles.icon,{backgroundColor:colors.background.paper}]}><MaterialIcons name="tune" size={23} color={colors.primary.main}/></Pressable><Pressable onPress={()=>void load(1,true)} style={[styles.icon,{backgroundColor:colors.background.paper}]}><MaterialIcons name="refresh" size={23} color={colors.primary.main}/></Pressable></View></View>
      <View style={styles.cards}>{primary.map(([label,value,color])=><View key={label as string} style={[styles.card,{backgroundColor:colors.background.paper,borderColor:colors.divider}]}><Text style={{color:colors.text.secondary,fontSize:11}}>{label}</Text><Text style={{color:color as string,fontWeight:'800',fontSize:15}} numberOfLines={1}>{value}</Text></View>)}</View>
      {(isAdmin()||isGestorCobro())&&<Pressable onPress={showManager} style={[styles.managerButton,{backgroundColor:colors.background.paper,borderColor:colors.divider}]}><MaterialIcons name="people-alt" size={20} color={colors.primary.main}/><Text style={{color:colors.text.primary,fontWeight:'700'}}>{isAdmin()?'Ver cobros por gestor':'Mis cobros'}</Text><MaterialIcons name="chevron-right" size={22} color={colors.text.secondary}/></Pressable>}
      <CarteraAnalyticsSection data={dashboard} colors={colors} onOpenBusiness={(id)=>router.push(`/negocio/${id}`)}/>
      <Text style={[styles.section,{color:colors.text.primary}]}>Cuotas</Text><Text style={{color:colors.text.secondary,fontSize:12,marginBottom:8}}>{filters.filter==='todas'?'Todas las cuotas abiertas':filters.filter.replace('_',' ') }{filters.municipioId?' · Municipio filtrado':''}</Text></>}
      renderItem={({item})=>{const overdue=daysOverdue(item.due_date);const border=item.status==='mora'||overdue>30?colors.error.main:overdue>0?colors.warning.main:colors.primary.main;return <Pressable onPress={()=>router.push(`/negocio/${item.negocio_id}`)} style={[styles.row,{backgroundColor:colors.background.paper,borderLeftColor:border}]}><View style={{flex:1,gap:2}}><Text style={{color:colors.text.primary,fontWeight:'800'}}>{formatNegocioCodigo(item.negocio_numero)} · cuota {item.installment_number}</Text><Text style={{color:colors.text.secondary,fontSize:13}}>{item.customer_name||'Cliente'}{item.municipio_name?` · ${item.municipio_name}`:''}</Text><Text style={{color:overdue>0?colors.error.main:colors.text.secondary,fontSize:12}}>Vence {item.due_date}{overdue>0?` · ${overdue} días de atraso`:''}</Text></View><View style={{alignItems:'flex-end',gap:4}}><Text style={{color:colors.text.primary,fontWeight:'800'}}>{formatCOP(Number(item.saldo))}</Text><Text style={{color:item.status==='mora'?colors.error.main:colors.text.secondary,fontSize:12,fontWeight:'700'}}>{item.status==='mora'?'En mora':item.status==='parcial'?'Parcial':'Pendiente'}</Text></View></Pressable>}}
      ListEmptyComponent={loading?<ActivityIndicator color={colors.primary.main} style={{margin:30}}/>:<View style={{alignItems:'center'}}><Text style={[styles.empty,{color:colors.text.secondary}]}>{fromCache?'No hay datos locales. Conéctese y pulse Descargar información.':'Sin cuotas para estos filtros'}</Text><DownloadDataButton variant="cta"/></View>}
      ListFooterComponent={rows.length<totalCount?<Pressable disabled={loadingMore} onPress={()=>void load(page+1,false)} style={[styles.loadMore,{borderColor:colors.divider}]}>{loadingMore?<ActivityIndicator color={colors.primary.main}/>:<Text style={{color:colors.primary.main,fontWeight:'700'}}>Cargar más · {rows.length} de {totalCount}</Text>}</Pressable>:rows.length?<Text style={[styles.end,{color:colors.text.secondary}]}>Mostrando {rows.length} de {totalCount} cuotas</Text>:null}/>
    <CarteraFilterModal visible={filtersOpen} colors={colors} municipios={municipios} values={draftFilters} onChange={setDraftFilters} onClose={applyFilters}/>
    <Modal visible={managerPickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setManagerPickerOpen(false)}><View style={[styles.pickerRoot,{backgroundColor:colors.background.default}]}><View style={[styles.pickerHeader,{borderBottomColor:colors.divider}]}><Text style={[styles.title,{color:colors.text.primary}]}>Seleccionar gestor</Text><Pressable onPress={()=>setManagerPickerOpen(false)}><MaterialIcons name="close" size={26} color={colors.text.primary}/></Pressable></View><TextInput autoFocus value={managerSearch} onChangeText={setManagerSearch} placeholder="Buscar por nombre" placeholderTextColor={colors.text.secondary} style={[styles.managerSearch,{borderColor:colors.divider,color:colors.text.primary,backgroundColor:colors.background.paper}]}/><FlatList data={managers} keyExtractor={(item)=>item.id} renderItem={({item})=><Pressable onPress={()=>{setSelectedManager(item);setManagerPickerOpen(false);setManagerModalOpen(true)}} style={[styles.managerRow,{borderBottomColor:colors.divider}]}><MaterialIcons name="person" size={22} color={colors.primary.main}/><Text style={{color:colors.text.primary,fontWeight:'600'}}>{item.full_name}</Text></Pressable>} ListEmptyComponent={<Text style={[styles.empty,{color:colors.text.secondary}]}>No se encontraron gestores</Text>}/></View></Modal>
    <CollectionManagerPaymentsModal visible={managerModalOpen} manager={selectedManager} colors={colors} onClose={()=>{setManagerModalOpen(false);setSelectedManager(null)}} onOpenBusiness={(id)=>{setManagerModalOpen(false);setSelectedManager(null);router.push(`/negocio/${id}`)}}/>
  </View>;
}
const styles=StyleSheet.create({container:{flex:1},list:{padding:16,paddingBottom:32},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},title:{fontSize:24,fontWeight:'800'},actions:{flexDirection:'row',gap:8},icon:{padding:10,borderRadius:10},cards:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:10},card:{width:'48%',borderWidth:1,borderRadius:10,padding:10,gap:4},managerButton:{borderWidth:1,borderRadius:10,padding:12,flexDirection:'row',alignItems:'center',gap:9,marginBottom:12},section:{fontSize:17,fontWeight:'800',marginTop:4},row:{flexDirection:'row',padding:13,borderRadius:10,borderLeftWidth:4,marginBottom:8,gap:8},empty:{textAlign:'center',marginVertical:35},loadMore:{borderWidth:1,borderRadius:10,padding:13,alignItems:'center',marginTop:6},end:{textAlign:'center',marginVertical:16,fontSize:12},pickerRoot:{flex:1},pickerHeader:{padding:16,flexDirection:'row',justifyContent:'space-between',borderBottomWidth:1},managerSearch:{margin:16,borderWidth:1,borderRadius:10,padding:12},managerRow:{padding:16,flexDirection:'row',gap:10,alignItems:'center',borderBottomWidth:1}});
