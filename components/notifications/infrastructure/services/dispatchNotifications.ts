import { supabase } from '@/lib/supabase';

/**
 * Empujón al emisor de notificaciones del panel web tras crear un registro.
 *
 * El aviso ya quedó guardado en la base por el trigger, así que esto solo
 * adelanta el envío: sin el empujón saldría igual en el siguiente barrido. Por
 * eso es deliberadamente silencioso — no se espera, no se muestra error y nunca
 * puede hacer fracasar la operación que acaba de completarse.
 */
export function kickNotificationDispatch(): void {
  const url = process.env.EXPO_PUBLIC_NOTIFICATIONS_DISPATCH_URL;
  if (!url) return;

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // El barrido periódico lo recoge.
    }
  })();
}
