
import { Capacitor } from '@capacitor/core';
import { PushNotifications, PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications';
import { updateUserFcmToken } from './adminService';
import { getFcmToken, onFcmMessage, getDiagnosticFirebaseConfig, isFirebaseConfigured, isSupported } from './firebase';
import Taro from '@tarojs/taro';

// Armazena o token FCM e os listeners para limpeza
let currentToken: string | null = null;
let tokenListener: any = null;
let errorListener: any = null;
let notificationListener: any = null;
let actionListener: any = null;
let fcmMessageUnsubscribe: (() => void) | null = null;
let isInitialized = false;
let currentUserId: string | null = null;

const ANDROID_CHANNEL_ID = 'gabi_manicure_channel_high_importance';
const TAG = '[PushService]';
const LOCAL_TOKEN_KEY = 'gm.fcmToken';

// Log seguro para não quebrar o app
const log = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`${TAG} [${timestamp}] ${message}`, data || '');
  // Salva log no debug (sem limite!)
  if (typeof window !== 'undefined') {
    if (!(window as any).__DEBUG_PUSH__) {
      (window as any).__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastTokenUpdate: null };
    }
    (window as any).__DEBUG_PUSH__.logs = [
      ...((window as any).__DEBUG_PUSH__.logs || []),
      { type: 'INFO', message, data, timestamp: Date.now() }
    ];
  }
};

const logError = (message: string, error?: any) => {
  const timestamp = new Date().toISOString();
  console.error(`${TAG} [${timestamp}] ERRO: ${message}`, error || '');
  // Salva log no debug (sem limite!)
  if (typeof window !== 'undefined') {
    if (!(window as any).__DEBUG_PUSH__) {
      (window as any).__DEBUG_PUSH__ = { logs: [], lastSent: null, lastReceived: null, lastError: null, lastTokenUpdate: null };
    }
    (window as any).__DEBUG_PUSH__.logs = [
      ...((window as any).__DEBUG_PUSH__.logs || []),
      { type: 'ERROR', message, data: error, timestamp: Date.now() }
    ];
    (window as any).__DEBUG_PUSH__.lastError = error;
  }
};

// Salva token no armazenamento local
const saveTokenLocal = (token: string) => {
  try {
    if (Capacitor.isNativePlatform()) {
      Taro.setStorageSync(LOCAL_TOKEN_KEY, token);
    } else if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LOCAL_TOKEN_KEY, token);
    }
  } catch (e) {
    logError('Erro ao salvar token local', e);
  }
  if (typeof window !== 'undefined') {
    (window as any).__DEBUG_PUSH__ = (window as any).__DEBUG_PUSH__ || { logs: [], lastSent: null, lastReceived: null, lastError: null, lastTokenUpdate: null };
    (window as any).__DEBUG_PUSH__.fcmToken = token;
    (window as any).__DEBUG_PUSH__.lastTokenUpdate = Date.now();
  }
  currentToken = token;
};

// Recupera token do armazenamento local
const getTokenLocal = (): string | null => {
  try {
    if (Capacitor.isNativePlatform()) {
      return Taro.getStorageSync(LOCAL_TOKEN_KEY) || null;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(LOCAL_TOKEN_KEY);
    }
  } catch (e) {
    logError('Erro ao recuperar token local', e);
  }
  return null;
};

/**
 * Inicializa todo o sistema de push notifications (tanto nativo quanto web)
 */
export const initializePushNotifications = async (userId?: string): Promise<void> => {
  if (userId) {
    currentUserId = userId;
  }
  
  // Verifica token local
  const localToken = getTokenLocal();
  if (localToken) {
    currentToken = localToken;
    log('Token local recuperado', { token: localToken.substring(0, 20) + '...' });
    // Tenta salvar token no Firebase se userId existir
    if (userId) {
      await saveTokenToFirebase(localToken, userId);
    }
  }

  if (isInitialized) {
    log('Push já inicializado, ignorando');
    return;
  }

  if (Capacitor.isNativePlatform()) {
    // Plataforma nativa (Android/iOS)
    log('Inicializando sistema de push notifications NATIVO');
    await initializeNativePush(userId);
  } else {
    // Plataforma web/PWA
    log('Inicializando sistema de push notifications WEB');
    await initializeWebPush(userId);
  }
  
  isInitialized = true;
};

/**
 * Inicializa push notifications nativo (Capacitor)
 */
const initializeNativePush = async (userId?: string): Promise<void> => {
  try {
    // Passo 1: Adicionar listeners PRIMEIRO (evita perder eventos)
    addNativeListeners(userId);

    // Passo 2: Solicitar permissões
    log('Solicitando permissões de notificações');
    const permissionStatus = await PushNotifications.requestPermissions();

    if (permissionStatus.receive !== 'granted') {
      logError('Permissão de notificações negada');
      return;
    }
    log('Permissão de notificações concedida');

    // Passo 3: Criar canal no Android (se necessário)
    if (Capacitor.getPlatform() === 'android') {
      await createAndroidChannel();
    }

    // Passo 4: Registrar para receber tokens
    log('Registrando dispositivo para push notifications');
    await PushNotifications.register();
  } catch (error) {
    logError('Falha ao inicializar push notifications nativo', error);
  }
};

/**
 * Inicializa push notifications web (Firebase JS SDK)
 */
const initializeWebPush = async (userId?: string): Promise<void> => {
  try {
    log('[initializeWebPush] INICIANDO DIAGNÓSTICO COMPLETO...');

    // Diagnóstico: verificar navigator.serviceWorker
    const hasServiceWorkerAPI = 'serviceWorker' in navigator;
    log('[initializeWebPush] navigator.serviceWorker disponível', { available: hasServiceWorkerAPI });

    // Diagnóstico: verificar Notification API
    const hasNotificationAPI = 'Notification' in window;
    let notificationPermission = 'unsupported';
    if (hasNotificationAPI) {
      notificationPermission = Notification.permission;
    }
    log('[initializeWebPush] Notification API status', {
      available: hasNotificationAPI,
      permission: notificationPermission,
    });

    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_PUSH__ = (window as any).__DEBUG_PUSH__ || { logs: [], lastSent: null, lastReceived: null, lastError: null, lastTokenUpdate: null };
      (window as any).__DEBUG_PUSH__.serviceWorkerAPIAvailable = hasServiceWorkerAPI;
      (window as any).__DEBUG_PUSH__.notificationAPIAvailable = hasNotificationAPI;
      (window as any).__DEBUG_PUSH__.notificationPermission = notificationPermission;
    }

    // Diagnóstico: isSupported() REAL do Firebase Messaging!
    let isMessagingSupported = false;
    try {
      isMessagingSupported = await isSupported();
      log('[initializeWebPush] isSupported() (do Firebase)', { isSupported: isMessagingSupported });
      if (typeof window !== 'undefined') {
        (window as any).__DEBUG_PUSH__.messagingIsSupported = isMessagingSupported;
      }
    } catch (e) {
      logError('[initializeWebPush] Erro ao verificar suporte do Messaging', e);
    }

    // Tenta obter registros de service worker existentes
    let existingSWRegistrations: ServiceWorkerRegistration[] = [];
    if (hasServiceWorkerAPI) {
      try {
        existingSWRegistrations = await navigator.serviceWorker.getRegistrations();
        log('[initializeWebPush] Service Workers existentes', {
          count: existingSWRegistrations.length,
          scopes: existingSWRegistrations.map(r => r.scope),
        });
        if (typeof window !== 'undefined') {
          (window as any).__DEBUG_PUSH__.existingSWRegistrations = existingSWRegistrations.map(r => ({
            scope: r.scope,
            active: !!r.active,
            waiting: !!r.waiting,
            installing: !!r.installing,
          }));
        }

        // Unregister all old SWs to avoid conflicts!
        log('[initializeWebPush] Removendo todos os SWs antigos para limpar');
        for (const reg of existingSWRegistrations) {
          await reg.unregister();
          log('[initializeWebPush] SW removido:', reg.scope);
        }
      } catch (swListErr) {
        logError('[initializeWebPush] Erro ao listar SW existentes', swListErr);
      }
    }

    // Tenta registrar o service worker do Firebase ANTES de chamar getMessaging
    let swRegistration: ServiceWorkerRegistration | null = null;
    if (hasServiceWorkerAPI) {
      try {
        const swPath = '/firebase-messaging-sw.js';
        log('[initializeWebPush] Registrando service worker', { path: swPath });

        // Step 1: Test fetching SW first to check if it exists and what the content is
        try {
          const swFetch = await fetch(swPath);
          log('[initializeWebPush] SW fetch result', { status: swFetch.status, ok: swFetch.ok });
          const swText = await swFetch.text();
          log('[initializeWebPush] SW content (primeiros 500 chars)', swText.substring(0, 500));
        } catch (fetchErr) {
          logError('[initializeWebPush] Falha ao buscar SW via fetch', fetchErr);
        }

        swRegistration = await navigator.serviceWorker.register(swPath);
        log('[initializeWebPush] Service Worker registrado com sucesso', {
          scope: swRegistration.scope,
          active: !!swRegistration.active,
          waiting: !!swRegistration.waiting,
          installing: !!swRegistration.installing,
        });
        
        if (typeof window !== 'undefined') {
          (window as any).__DEBUG_PUSH__.serviceWorkerRegistered = true;
          (window as any).__DEBUG_PUSH__.serviceWorkerScope = swRegistration.scope;
          (window as any).__DEBUG_PUSH__.serviceWorkerActive = !!swRegistration.active;
          (window as any).__DEBUG_PUSH__.serviceWorkerWaiting = !!swRegistration.waiting;
          (window as any).__DEBUG_PUSH__.serviceWorkerInstalling = !!swRegistration.installing;
        }
      } catch (registerError: any) {
        logError('[initializeWebPush] Falha ao registrar service worker', {
          errorName: registerError?.name || 'unknown',
          errorMessage: registerError?.message || 'sem mensagem',
          errorStack: registerError?.stack || 'sem stack',
        });
        if (typeof window !== 'undefined') {
          (window as any).__DEBUG_PUSH__.serviceWorkerRegistered = false;
          (window as any).__DEBUG_PUSH__.serviceWorkerError = registerError?.message;
        }
      }
    } else {
      log('[initializeWebPush] Service Worker API não disponível neste navegador');
    }

    // Agora tenta obter Firebase Messaging
    log('[initializeWebPush] Obtendo Firebase Messaging...');
    const messaging = getFirebaseMessaging();
    
    if (!messaging) {
      const diag = typeof getDiagnosticFirebaseConfig === 'function' ? getDiagnosticFirebaseConfig() : {};
      logError('[initializeWebPush] Firebase Messaging não está disponível no navegador', { diagnostic: diag });
      if (typeof window !== 'undefined') {
        (window as any).__DEBUG_PUSH__ = (window as any).__DEBUG_PUSH__ || { logs: [], lastSent: null, lastReceived: null, lastError: null, lastTokenUpdate: null };
        (window as any).__DEBUG_PUSH__.messagingAvailable = false;
        (window as any).__DEBUG_PUSH__.firebaseDiagnostic = diag;
        (window as any).__DEBUG_PUSH__.messagingObjectCreated = false;
      }
      return;
    }

    log('[initializeWebPush] Firebase Messaging criado com sucesso');
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_PUSH__.messagingAvailable = true;
      (window as any).__DEBUG_PUSH__.messagingObjectCreated = true;
    }

    // Adiciona listener para mensagens em primeiro plano
    addWebListeners();

    // Solicita permissão de notificações
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      log('[initializeWebPush] Permissão de notificações após requestPermission()', { permission });
      if (typeof window !== 'undefined') {
        (window as any).__DEBUG_PUSH__.notificationPermission = permission;
      }

      if (permission === 'granted') {
        log('[initializeWebPush] Permissão de notificações concedida');
        
        // Obtém token FCM para Web
        try {
          log('[initializeWebPush] Chamando getFcmToken()...');
          const getTokenStartTime = Date.now();
          const webToken = await getFcmToken(swRegistration || undefined);
          const getTokenEndTime = Date.now();
          const getTokenDuration = getTokenEndTime - getTokenStartTime;
          
          if (webToken) {
            log('[initializeWebPush] Token FCM Web obtido', { token: webToken.substring(0, 20) + '...', duration: getTokenDuration + 'ms' });
            saveTokenLocal(webToken);
            if (userId) {
              await saveTokenToFirebase(webToken, userId);
            }
            if (typeof window !== 'undefined') {
              (window as any).__DEBUG_PUSH__.getFcmTokenSuccess = true;
              (window as any).__DEBUG_PUSH__.getFcmToken = webToken;
              (window as any).__DEBUG_PUSH__.getFcmTokenDuration = getTokenDuration;
              (window as any).__DEBUG_PUSH__.getFcmTokenTimestamp = getTokenEndTime;
            }
          } else {
            logError('[initializeWebPush] Não foi possível obter token FCM Web: getFcmToken retornou null');
            if (typeof window !== 'undefined') {
              (window as any).__DEBUG_PUSH__.getFcmTokenSuccess = false;
              (window as any).__DEBUG_PUSH__.getFcmTokenError = 'retornou null';
              (window as any).__DEBUG_PUSH__.getFcmTokenDuration = getTokenDuration;
              (window as any).__DEBUG_PUSH__.getFcmTokenTimestamp = getTokenEndTime;
            }
          }
        } catch (getTokenErr: any) {
          const getTokenEndTime = Date.now();
          logError('[initializeWebPush] Erro ao obter token FCM Web', {
            name: getTokenErr?.name,
            code: getTokenErr?.code,
            message: getTokenErr?.message,
            stack: getTokenErr?.stack,
          });
          if (typeof window !== 'undefined') {
            (window as any).__DEBUG_PUSH__.getFcmTokenSuccess = false;
            (window as any).__DEBUG_PUSH__.getFcmTokenError = getTokenErr?.message || 'unknown';
            (window as any).__DEBUG_PUSH__.getFcmTokenErrorFull = getTokenErr;
          }
        }
      } else {
        logError('[initializeWebPush] Permissão de notificações negada');
      }
    } else {
      logError('[initializeWebPush] Notification API não disponível');
    }
  } catch (error: any) {
    logError('[initializeWebPush] Falha ao inicializar push notifications web', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
    });
  }
};

/**
 * Adiciona listeners para push nativo (Capacitor)
 */
const addNativeListeners = (userId?: string) => {
  // Listener de token recebido
  tokenListener = PushNotifications.addListener(
    'registration',
    async (token: Token) => {
      log('Token FCM recebido (nativo)', { token: token.value.substring(0, 20) + '...' });
      saveTokenLocal(token.value);
      if (userId || currentUserId) {
        await saveTokenToFirebase(token.value, userId || currentUserId!);
      }
    }
  );

  // Listener de erro no registro
  errorListener = PushNotifications.addListener(
    'registrationError',
    (error: any) => {
      logError('Erro no registro de push (nativo)', error);
    }
  );

  // Listener de notificação recebida com app aberto
  notificationListener = PushNotifications.addListener(
    'pushNotificationReceived',
    async (notification: PushNotificationSchema) => {
      log('Notificação recebida com app aberto (nativo)', notification);
      if (typeof window !== 'undefined') {
        (window as any).__DEBUG_PUSH__ = (window as any).__DEBUG_PUSH__ || { logs: [], lastSent: null, lastReceived: null, lastError: null, lastTokenUpdate: null };
        (window as any).__DEBUG_PUSH__.lastReceived = notification;
      }
      
      // Mostra a notificação como banner mesmo com app aberto
      try {
        await (PushNotifications as any).localNotification({
          title: notification.title || 'Nova Notificação',
          body: notification.body || '',
          id: Math.floor(Math.random() * 100000),
          sound: 'default',
          soundName: 'default',
          channelId: ANDROID_CHANNEL_ID,
          data: notification.data
        });
        log('Notificação local exibida (nativo)');
      } catch (localError) {
        logError('Erro ao exibir notificação local (nativo)', localError);
      }
    }
  );

  // Listener de ação de notificação (clicada)
  actionListener = PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      log('Ação de notificação executada (nativo)', action);
      handleNotificationAction(action);
    }
  );
};

/**
 * Adiciona listeners para push web (Firebase)
 */
const addWebListeners = () => {
  // Listener para mensagens em primeiro plano
  fcmMessageUnsubscribe = onFcmMessage((payload: any) => {
    log('Notificação recebida com app aberto (web)', payload);
    if (typeof window !== 'undefined') {
      (window as any).__DEBUG_PUSH__ = (window as any).__DEBUG_PUSH__ || { logs: [], lastSent: null, lastReceived: null, lastError: null, lastTokenUpdate: null };
      (window as any).__DEBUG_PUSH__.lastReceived = payload;
    }
    
    // Mostra notificação usando a API de notificações do navegador
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(payload.notification?.title || 'Nova Notificação', {
        body: payload.notification?.body || '',
        icon: '/icon.png'
      });
    }
  });
};

/**
 * Cria o canal de notificação Android com alta prioridade
 */
const createAndroidChannel = async () => {
  try {
    log('Criando canal Android de notificações');
    await PushNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'Notificações Gabi Manicure',
      description: 'Notificações importantes do app Gabi Manicure',
      importance: 5, // Importância máxima para heads-up
      sound: 'default',
      vibration: true,
      visibility: 1, // Visível na tela de bloqueio
      lights: true,
    });
    log('Canal Android criado com sucesso');
  } catch (error) {
    logError('Erro ao criar canal Android', error);
  }
};

/**
 * Salva o token FCM no Firebase Firestore
 */
export const saveTokenToFirebase = async (token: string, userId: string) => {
  try {
    log('Salvando token FCM no Firebase para usuário', { userId, token: token.substring(0, 20) + '...' });
    // Try client-side save first
    try {
      await updateUserFcmToken(userId, token);
    } catch (e) {
      logError('updateUserFcmToken falhou, tentarei via endpoint server', e);
    }

    // If client cannot save because Firebase not configured in-browser, fallback to server endpoint
    if (!isFirebaseConfigured()) {
      try {
        const resp = await fetch('/api/register-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, token }),
        });
        if (!resp.ok) {
          const txt = await resp.text();
          logError('Falha ao salvar token via /api/register-token', { status: resp.status, body: txt });
        } else {
          log('Token salvo via endpoint server /api/register-token');
        }
      } catch (serverErr) {
        logError('Erro chamando /api/register-token', serverErr);
      }
    }
    log('Token FCM salvo com sucesso no Firebase');
  } catch (error) {
    logError('Erro ao salvar token no Firebase', error);
  }
};

/**
 * Lida com a ação quando a notificação é clicada
 */
const handleNotificationAction = (action: ActionPerformed) => {
  const notification = action.notification;
  const data = notification.data as any;

  log('Lidando com ação de notificação', { actionId: action.actionId, data });

  // Aqui você pode adicionar navegação para telas específicas
  if (data?.appointmentId) {
    log('Navegando para agendamento', { appointmentId: data.appointmentId });
    // Exemplo de navegação: import Taro from '@tarojs/taro'; Taro.navigateTo({ url: '/pages/booking/index?appointmentId=' + data.appointmentId });
  }
};

/**
 * Limpa todos os listeners e reseta o estado
 */
export const cleanupPushListeners = () => {
  log('Limpando listeners de push notifications');
  if (tokenListener?.remove) tokenListener.remove();
  if (errorListener?.remove) errorListener.remove();
  if (notificationListener?.remove) notificationListener.remove();
  if (actionListener?.remove) actionListener.remove();
  if (fcmMessageUnsubscribe) fcmMessageUnsubscribe();
  isInitialized = false;
};

/**
 * Retorna o token FCM atual (se disponível)
 */
export const getCurrentFcmToken = (): string | null => {
  if (currentToken) return currentToken;
  return getTokenLocal();
};

/**
 * Exibe permissões de notificações (para debug)
 */
export const checkPushPermissions = async (): Promise<any> => {
  if (Capacitor.isNativePlatform()) {
    try {
      return await PushNotifications.checkPermissions();
    } catch (e) {
      logError('Erro ao verificar permissões nativas', e);
      return null;
    }
  } else {
    return { receive: 'Notification' in window ? Notification.permission : 'unsupported' };
  }
};

/**
 * Importações necessárias para evitar erros de referência
 */
import { getFirebaseMessaging } from './firebase';
