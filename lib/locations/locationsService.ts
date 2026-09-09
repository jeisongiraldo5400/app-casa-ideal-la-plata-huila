import { supabase } from '@/lib/supabase';

/** Maestros de ubicación (departamento → municipio → vereda), los mismos que
 *  usan clientes, negocios y órdenes de entrega en el web. */
export type Departamento = { id: string; nombre: string };
export type Municipio = { id: string; nombre: string; departamento_id: string };
export type Vereda = { id: string; nombre: string; municipio_id: string };

export type LocationMasters = {
  departamentos: Departamento[];
  municipios: Municipio[];
  veredas: Vereda[];
};

export const EMPTY_LOCATION_MASTERS: LocationMasters = {
  departamentos: [],
  municipios: [],
  veredas: [],
};

/** Carga los tres maestros de una vez. Cambian una vez cada varios meses, así
 *  que la pantalla los pide al montar y los guarda en estado. */
export async function fetchLocationMasters(): Promise<LocationMasters> {
  const [departamentos, municipios, veredas] = await Promise.all([
    supabase.from('departamentos').select('id,nombre').is('deleted_at', null).eq('is_active', true).order('nombre'),
    supabase.from('municipios').select('id,nombre,departamento_id').is('deleted_at', null).eq('is_active', true).order('nombre'),
    supabase.from('veredas').select('id,nombre,municipio_id').is('deleted_at', null).eq('is_active', true).order('nombre'),
  ]);

  const firstError = departamentos.error || municipios.error || veredas.error;
  if (firstError) {
    throw new Error(firstError.message || 'No fue posible cargar los maestros de ubicación');
  }

  return {
    departamentos: (departamentos.data || []) as Departamento[],
    municipios: (municipios.data || []) as Municipio[],
    veredas: (veredas.data || []) as Vereda[],
  };
}
