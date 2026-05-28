// TypeScript declaration for injected OneSignal environment variables
declare global {
  interface Window {
    __GM_ONESIGNAL_ENV__?: {
      appId?: string;
      restApiKey?: string;
    };
  }
}

const ONESIGNAL_APP_ID =
  (typeof window !== 'undefined' && window.__GM_ONESIGNAL_ENV__?.appId) || '82892143-d160-4756-8b63-327b8f69a41e';
const ONESIGNAL_REST_API_KEY =
  (typeof window !== 'undefined' && window.__GM_ONESIGNAL_ENV__?.restApiKey) || '';

export interface SendOneSignalNotificationParams {
  title: string;
  body: string;
  playerIds: string[];
  data?: Record<string, any>;
}

export async function sendOneSignalNotification(params: SendOneSignalNotificationParams): Promise<boolean> {
  console.log('========================================');
  console.log('[OneSignal] ENVIANDO NOTIFICAÇÃO CLOUD');
  console.log('========================================');
  console.log('[OneSignal] Parâmetros recebidos:', params);
  console.log('[OneSignal] App ID:', ONESIGNAL_APP_ID);
  console.log('[OneSignal] REST API Key disponível:', !!ONESIGNAL_REST_API_KEY);

  try {
    // Validação básica
    if (!params.playerIds || params.playerIds.length === 0) {
      console.warn('[OneSignal] Nenhum player ID fornecido - cancelando envio');
      return false;
    }
    if (!ONESIGNAL_REST_API_KEY) {
      console.warn('[OneSignal] REST API Key não configurada - cancelando envio');
      return false;
    }

    // Monta o payload para a API OneSignal
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: params.playerIds,
      headings: { en: params.title },
      contents: { en: params.body },
      data: params.data || {},
      android_channel_id: 'gabi_manicure_notifications',
      priority: 10,
      android_background_data: true,
      chrome_web_icon: '/icon.svg',
      firefox_icon: '/icon.svg',
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
    };

    console.log('[OneSignal] Payload para API:', JSON.stringify(payload, null, 2));

    // Chama a API REST do OneSignal diretamente
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('[OneSignal] Status da resposta:', response.status, response.statusText);

    const result = await response.json();
    console.log('[OneSignal] Resposta da API:', JSON.stringify(result, null, 2));

    if (!response.ok) {
      console.error('[OneSignal] ERRO NA API:', result);
      return false;
    }

    console.log('[OneSignal] ✅ NOTIFICAÇÃO CLOUD ENVIADA COM SUCESSO!');
    console.log('========================================');
    return true;
  } catch (error) {
    console.error('[OneSignal] ❌ ERRO NO ENVIO CLOUD:', error);
    console.log('========================================');
    return false;
  }
}
