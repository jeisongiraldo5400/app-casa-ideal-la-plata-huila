import { MaterialIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CarteraFilter, Municipio } from '@/lib/cartera/carteraService';

type Props = {
  visible: boolean; colors: any; municipios: Municipio[]; values: { filter: CarteraFilter; search: string; municipioId: string; days: number; searchMunicipio: string };
  onChange: (next: Props['values']) => void; onClose: () => void;
};
const FILTERS: { id: CarteraFilter; label: string }[] = [
  { id: 'todas', label: 'Todas abiertas' }, { id: 'por_vencer', label: 'Por vencer' },
  { id: 'vencidas', label: 'Vencidas' }, { id: 'mora', label: 'En mora' },
];

export function CarteraFilterModal({ visible, colors, municipios, values, onChange, onClose }: Props) {
  const selectedMunicipio = municipios.find((item) => item.id === values.municipioId);
  const searchMunicipio = values.searchMunicipio || '';
  const available = municipios.filter((item) => item.nombre.toLowerCase().includes(searchMunicipio.toLowerCase())).slice(0, 30);
  const patch = (next: Partial<Props['values']>) => onChange({ ...values, ...next });
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={[styles.container, { backgroundColor: colors.background.default }]}> 
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Filtros de cartera</Text>
        <Pressable onPress={onClose} hitSlop={10}><MaterialIcons name="close" size={26} color={colors.text.primary} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.text.secondary }]}>Estado de la cuota</Text>
        <View style={styles.chips}>{FILTERS.map((item) => <Pressable key={item.id} onPress={() => patch({ filter: item.id })} style={[styles.chip, { borderColor: colors.divider, backgroundColor: values.filter === item.id ? colors.primary.main : colors.background.paper }]}><Text style={{ color: values.filter === item.id ? colors.primary.contrastText : colors.text.primary, fontWeight: '600' }}>{item.label}</Text></Pressable>)}</View>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Buscar cuota</Text>
        <TextInput value={values.search} onChangeText={(search) => patch({ search })} placeholder="Negocio, cliente o documento" placeholderTextColor={colors.text.secondary} style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]} />
        <Text style={[styles.label, { color: colors.text.secondary }]}>Municipio</Text>
        <TextInput value={searchMunicipio} onChangeText={(searchMunicipio) => patch({ searchMunicipio })} placeholder={selectedMunicipio?.nombre || 'Todos los municipios'} placeholderTextColor={colors.text.secondary} style={[styles.input, { borderColor: colors.divider, color: colors.text.primary, backgroundColor: colors.background.paper }]} />
        <Pressable onPress={() => patch({ municipioId: '', searchMunicipio: '' })} style={styles.clearMunicipio}><Text style={{ color: colors.primary.main, fontWeight: '600' }}>Todos los municipios</Text></Pressable>
        {available.map((municipio) => <Pressable key={municipio.id} onPress={() => patch({ municipioId: municipio.id, searchMunicipio: municipio.nombre })} style={[styles.option, { borderBottomColor: colors.divider }]}><Text style={{ color: colors.text.primary }}>{municipio.nombre}</Text>{values.municipioId === municipio.id && <MaterialIcons name="check" size={20} color={colors.primary.main} />}</Pressable>)}
        {values.filter === 'por_vencer' && <><Text style={[styles.label, { color: colors.text.secondary }]}>Días para vencer</Text><View style={styles.chips}>{[7, 15, 30].map((days) => <Pressable key={days} onPress={() => patch({ days })} style={[styles.chip, { borderColor: colors.divider, backgroundColor: values.days === days ? colors.primary.main : colors.background.paper }]}><Text style={{ color: values.days === days ? colors.primary.contrastText : colors.text.primary, fontWeight: '600' }}>{days} días</Text></Pressable>)}</View></>}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.divider }]}><Pressable onPress={() => onChange({ filter: 'todas', search: '', municipioId: '', days: 15, searchMunicipio: '' } as any)} style={[styles.outlineButton, { borderColor: colors.divider }]}><Text style={{ color: colors.text.primary, fontWeight: '700' }}>Limpiar</Text></Pressable><Pressable onPress={onClose} style={[styles.applyButton, { backgroundColor: colors.primary.main }]}><Text style={{ color: colors.primary.contrastText, fontWeight: '700' }}>Aplicar filtros</Text></Pressable></View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ container:{ flex:1 }, header:{ flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:18,borderBottomWidth:1 }, title:{ fontSize:20,fontWeight:'700' }, content:{ padding:16,gap:10 }, label:{ fontSize:13,fontWeight:'700',marginTop:8 }, chips:{ flexDirection:'row',flexWrap:'wrap',gap:8 }, chip:{ paddingHorizontal:12,paddingVertical:9,borderRadius:18,borderWidth:1 }, input:{ borderWidth:1,borderRadius:10,paddingHorizontal:13,paddingVertical:12,fontSize:15 }, option:{ paddingVertical:13,flexDirection:'row',justifyContent:'space-between',borderBottomWidth:1 }, clearMunicipio:{ paddingVertical:8 }, footer:{ padding:16,flexDirection:'row',gap:10,borderTopWidth:1 }, outlineButton:{ flex:1,borderWidth:1,borderRadius:10,alignItems:'center',padding:13 }, applyButton:{ flex:1,borderRadius:10,alignItems:'center',padding:13 } });
