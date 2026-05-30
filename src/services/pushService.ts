import { Capacitor } from '@capacitor/core';
import { PushNotifications, PushNotificationSchema, ActionPerformed, Token } from '@capacitor/push-notifications';
import { updateUserFcmToken } from './adminService';

// Armazena o token FCM e os listeners para limpeza
let currentToken: string | null = null;
let tokenListener: any = null;
let errorListener: any = null;
let notificationListener: any = null;
let actionListener: any = null;
let isInitialized = false;

const ANDROID_CHANNEL_ID = 'gabi_manicure_channel_high_importance';
const TAG = '[PushService]';

// Log seguro para não quebrar o app
const log = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`${TAG} [${timestamp}] ${message}`, data || '');
};

const logError = (message: string, error?: any) => {
  const timestamp = new Date().toISOString();
  console.error(`${TAG} [${timestamp}] ERRO: ${message}`, error || '');
};

/**
 * Inicializa todo o sistema de push notifications
 */
export const initializePushNotifications = async (userId?: string): Promise<void> => {
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
      if (userId) {
        await saveTokenToFirebase(token.value, userId);
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
    (notification: PushNotificationSchema) => {
      log('Notificação recebida com app aberto', notification);
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
  return currentToken;
};
