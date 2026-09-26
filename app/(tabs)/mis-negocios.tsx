import { Redirect } from 'expo-router';

/**
 * «Mis negocios» ahora es la pestaña «Míos» de Negocios. La ruta se conserva
 * para que los enlaces y avisos que apuntan aquí sigan funcionando.
 */
export default function MisNegociosRedirect() {
  return <Redirect href={{ pathname: '/(tabs)/negocios', params: { alcance: 'mios' } }} />;
}
