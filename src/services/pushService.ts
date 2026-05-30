import { Capacitor } from '@capacitor/core';
import { PushNotifications, PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications';
import { updateUserFcmToken } from './adminService';
import Taro from '@tarojs/taro';

// Armazena o token FCM e os listeners para limpeza
let currentToken: string | null = null;
let tokenListener: any = null;
let errorListener: any = null;
let notificationListener: any = null;
let actionListener: any = null;
let isInitialized = false;
let currentUserId: string | null = null;

const ANDROID_CHANNEL_ID = 'gabi_manicure_channel_high_importance';
const TAG = '[PushService]';
const LOCAL_TOKEN_KEY = 'gm.fcmToken';

// Log seguro para não quebrar o app
const log = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`${TAG} [${timestamp}] ${message}`, data || '');
  // Salva log no debug
  if (typeof window !== 'undefined') {
    if (!(window as any).__DEBUG_PUSH) {
      (window as any).__DEBUG_PUSH = { logs: [], lastSent: null, lastReceived: null, lastError: null };
    }
    (window as any).__DEBUG_PUSH.logs = [
      ...((window as any).__DEBUG_PUSH.logs || []),
      { type: 'INFO', message, data, timestamp: Date.now() }
    ].slice(-100);
  }
};

const logError = (message: string, error?: any) => {
  const timestamp = new Date().toISOString();
  console.error(`${TAG} [${timestamp}] ERRO: ${message}`, error || '');
  // Salva log no debug
  if (typeof window !== 'undefined') {
    if (!(window as any).__DEBUG_PUSH) {
      (window as any).__DEBUG_PUSH = { logs: [], lastSent: null, lastReceived: null, lastError: null };
    }
    (window as any).__DEBUG_PUSH.logs = [
      ...((window as any).__DEBUG_PUSH.logs || []),
      { type: 'ERROR', message, data: error, timestamp: Date.now() }
    ].slice(-100);
    (window as any).__DEBUG_PUSH.lastError = error;
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
    (window as any).__DEBUG_PUSH = (window as any).__DEBUG_PUSH || {};
    (window as any).__DEBUG_PUSH.fcmToken = token;
  }
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
 * Inicializa todo o sistema de push notifications
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

  // Verifica se está em plataforma nativa
  if (!Capacitor.isNativePlatform()) {
    log('Plataforma não nativa, ignorando inicialização push');
    return;
  }

  log('Inicializando sistema de push notifications');

  try {
    // Passo 1: Adicionar listeners PRIMEIRO (evita perder eventos)
    addListeners(userId);

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

    isInitialized = true;
    log('Sistema de push inicializado com sucesso');
  } catch (error) {
    logError('Falha ao inicializar push notifications', error);
  }
};

/**
 * Adiciona todos os listeners de push notification
 */
const addListeners = (userId?: string) => {
  // Listener de token recebido
  tokenListener = PushNotifications.addListener(
    'registration',
    async (token: Token) => {
      log('Token FCM recebido', { token: token.value.substring(0, 20) + '...' });
      currentToken = token.value;
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
      logError('Erro no registro de push', error);
    }
  );

  // Listener de notificação recebida com app aberto
  notificationListener = PushNotifications.addListener(
    'pushNotificationReceived',
    async (notification: PushNotificationSchema) => {
      log('Notificação recebida com app aberto', notification);
      if (typeof window !== 'undefined') {
        (window as any).__DEBUG_PUSH = (window as any).__DEBUG_PUSH || {};
        (window as any).__DEBUG_PUSH.lastReceived = notification;
      }
      
      // Mostra a notificação como banner mesmo com som e som/vibração mesmo com app aberto
      try {
        await PushNotifications.localNotification({
          title: notification.title || 'Nova Notificação',
          body: notification.body || '',
          id: Math.floor(Math.random() * 100000),
          sound: 'default',
          soundName: 'default',
          channelId: ANDROID_CHANNEL_ID,
          data: notification.data
        });
        log('Notificação local exibida');
      } catch (localError) {
        logError('Erro ao exibir notificação local', localError);
      }
    }
  );

  // Listener de ação de notificação (clicada)
  actionListener = PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      log('Ação de notificação executada', action);
      handleNotificationAction(action);
    }
  );
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
    log('Salvando token FCM no Firebase para usuário', { userId });
    await updateUserFcmToken(userId, token);
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
    // Exemplo de navegação: import Taro from '@tarojs/taro'; Taro.navigateTo({ url: `/pages/booking/index?appointmentId=${data.appointmentId}` });
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
  isInitialized = false;
};

/**
 * Retorna o token FCM atual (se disponível)
 */
export const getCurrentFcmToken = (): string | null => {
  if (currentToken) return currentToken;
  return getTokenLocal();
};
