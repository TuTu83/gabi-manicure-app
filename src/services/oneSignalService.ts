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

const addDebugLog = (type: string, message: string, data?: any) => {
  const log = { type, message, timestamp: Date.now(), data };
  const debugStore = (window as any).__DEBUG_PUSH || { logs: [], lastSent: null, lastError: null };
  console.log(`\n=== [${type}] ===`);
  console.log(message, data || '');
  console.log('==================\n');
  debugStore.logs = [...(debugStore.logs || []), log];
  if (debugStore.logs.length > 100) debugStore.logs.shift();
  if (type.includes('ERROR') || type.includes('ERR')) {
    debugStore.lastError = log;
  }
  (window as any).__DEBUG_PUSH = debugStore;
};

export interface SendOneSignalNotificationParams {
  title: string;
  body: string;
  playerIds: string[];
  data?: Record<string, any>;
}

export async function sendOneSignalNotification(params: SendOneSignalNotificationParams): Promise<boolean> {
  // ========================================
  // ETAPA: DEBUG DE ENVIO CLOUD
  // ========================================
  addDebugLog('CLOUD PUSH DEBUG', 'INICIANDO ENVIO DE PUSH CLOUD!');
  addDebugLog('CLOUD PUSH DEBUG', 'Parâmetros recebidos:', params);
  addDebugLog('CLOUD PUSH DEBUG', `App ID configurado: ${ONESIGNAL_APP_ID}`);
  addDebugLog('CLOUD PUSH DEBUG', `REST API Key configurada: ${ONESIGNAL_REST_API_KEY ? 'SIM' : 'NÃO'}`);

  try {
    // ========================================
    // ETAPA: VALIDAÇÃO BÁSICA
    // ========================================
    if (!params.playerIds || params.playerIds.length === 0) {
      addDebugLog('CLOUD PUSH AVISO', 'Nenhum player ID fornecido! Cancelando envio.');
      return false;
    }
    addDebugLog('CLOUD PUSH DEBUG', `Player IDs válidos: ${params.playerIds.length}`);
    
    if (!ONESIGNAL_REST_API_KEY) {
      addDebugLog('CLOUD PUSH AVISO', 'REST API Key NÃO configurada! Abortando envio cloud.');
      return false;
    }

    // ========================================
    // ETAPA: MONTAGEM DO PAYLOAD
    // ========================================
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: params.playerIds,
      headings: { en: params.title },
      contents: { en: params.body },
      data: params.data || {},
      android_channel_id: 'gabi_manicure_notifications',
      priority: 10, // High priority
      android_background_data: true,
      chrome_web_icon: '/icon.svg',
      firefox_icon: '/icon.svg',
      ios_badgeType: 'Increase',
      ios_badgeCount: 1,
      // Garante heads-up no Android
      android_visibility: 1,
      android_sound: 'default',
      android_led_color: 'FFFFFF',
      android_accent_color: 'FF4C84C1',
    };

    addDebugLog('CLOUD PUSH DEBUG', 'Payload completo para OneSignal:', JSON.parse(JSON.stringify(payload)));

    // ========================================
    // ETAPA: REQUISIÇÃO À API
    // ========================================
    addDebugLog('CLOUD PUSH DEBUG', 'Enviando requisição POST para OneSignal API...');
    const startTime = Date.now();
    
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const duration = Date.now() - startTime;
    addDebugLog('CLOUD PUSH DEBUG', `Resposta recebida em ${duration}ms`);
    addDebugLog('CLOUD PUSH DEBUG', `Status HTTP: ${response.status} ${response.statusText}`);

    // ========================================
    // ETAPA: ANÁLISE DA RESPOSTA
    // ========================================
    let result;
    try {
      result = await response.json();
      addDebugLog('CLOUD PUSH DEBUG', 'Corpo da resposta:', result);
    } catch (jsonErr) {
      addDebugLog('CLOUD PUSH ERROR', 'Falha ao parsear JSON da resposta', jsonErr);
      return false;
    }

    if (!response.ok) {
      addDebugLog('CLOUD PUSH ERROR', 'OneSignal API retornou erro!', {
        status: response.status,
        errors: result.errors,
      });
      return false;
    }

    // ========================================
    // ETAPA: LOG DE SUCESSO
    // ========================================
    addDebugLog('CLOUD PUSH SUCESSO', 'NOTIFICAÇÃO CLOUD ENVIADA COM SUCESSO!', {
      recipients: result.recipients,
      id: result.id,
    });
    
    if (result.invalid_player_ids && result.invalid_player_ids.length > 0) {
      addDebugLog('CLOUD PUSH AVISO', 'Alguns player IDs são inválidos:', result.invalid_player_ids);
    }

    // Atualiza debug store
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_PUSH.lastSent = { payload, result, timestamp: Date.now() };
    }

    return true;
  } catch (error) {
    addDebugLog('CLOUD PUSH ERROR', 'ERRO CRÍTICO NO ENVIO CLOUD!', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    return false;
  }
}
