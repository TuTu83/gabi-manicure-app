import Taro from '@tarojs/taro';
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured, removeUndefinedFields } from '@/services/firebase';
import { Appointment, InAppNotification, NotificationType } from '@/types/booking';
import { getLocalSettings } from '@/services/settingsService';
import { getUserFcmTokens, sendFcmNotification } from './appointmentService';

// Função temporária de teste para enviar notificação diretamente
export async function enviarPushTeste(token: string): Promise<any> {
  console.log('[TESTE PUSH] Iniciando função enviarPushTeste');
  
  const payload = {
    title: 'TESTE PUSH',
    body: 'Se você recebeu isso, o FCM Android está funcionando!',
    fcmTokens: [token],
    data: { type: 'test_push' },
  };
  
  console.log('[TESTE PUSH] Payload a enviar:', payload);
  
  const result = await sendFcmNotification(payload);
  
  console.log('[TESTE PUSH] Resultado do envio:', result);
  
  return result;
}

type Unsubscribe = () => void;

export interface ShowNotificationOptions {
  appointmentId?: string;
  url?: string;
  action?: 'on_my_way';
  notificationId?: string;
}

const localKey = 'gm.notifications';
const reminderKey = 'gm.reminders.sent';
const startReminderKey = 'gm.start.reminders.sent';

function safeGetLocal(): InAppNotification[] {
  try {
    const value = Taro.getStorageSync(localKey);
    return (value as InAppNotification[]) || [];
  } catch (error) {
    console.error('[Notificacoes] falha ao ler armazenamento local', error);
    return [];
  }
}

function safeSetLocal(items: InAppNotification[]): void {
  try {
    Taro.setStorageSync(localKey, items);
  } catch (error) {
    console.error('[Notificacoes] falha ao salvar armazenamento local', error);
  }
}

export async function requestNotificationPermission(): Promise<void> {
  try {
    console.warn('[Notificacoes] Usando apenas Capacitor Push API');
    return;
  } catch (error) {
    console.error('[Notificacoes] falha ao solicitar permissão', error);
  }
}

export function subscribeNotificationsForUser(userId: string, onChange: (items: InAppNotification[]) => void): Unsubscribe {
  if (!userId) {
    onChange([]);
    return () => {};
  }

  if (!isFirebaseConfigured()) {
    const items = safeGetLocal().filter((n) => n.target === 'cliente' && n.targetUserId === userId);
    onChange(items.sort((a, b) => b.createdAt - a.createdAt));
    return () => {};
  }

  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, 'notifications'), where('targetUserId', '==', userId));

  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<InAppNotification, 'id'>) }))
        .filter((n) => n.target === 'cliente' && n.targetUserId === userId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onChange(items);
    },
    (error) => {
      console.error('[Notificacoes] falha ao escutar notificações', error);
      onChange([]);
    },
  );
  return unsub;
}

export async function createNotification(params: {
  target: 'cliente' | 'admin';
  targetUserId?: string;
  type: NotificationType;
  title: string;
  body: string;
  appointmentId?: string;
  negotiationId?: string;
}): Promise<string | undefined> {
  const payloadRaw: Omit<InAppNotification, 'id'> & { deliveredAt?: number } = {
    target: params.target,
    targetUserId: params.targetUserId,
    type: params.type,
    title: params.title,
    body: params.body,
    createdAt: Date.now(),
    appointmentId: params.appointmentId,
    negotiationId: params.negotiationId,
  };
  const payload = removeUndefinedFields(payloadRaw);

  if (!isFirebaseConfigured()) {
    const current = safeGetLocal();
    const next: InAppNotification = { id: `local_${Date.now()}`, ...payload };
    safeSetLocal([next, ...current]);
    return next.id;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  const docRef = await addDoc(collection(db, 'notifications'), payload);
  return docRef.id;
}

/**
 * Send notification ONLY to ADMINS
 */
export async function sendToAdminOnly(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<any> {
  try {
    console.log('[sendToAdminOnly] Sending notification to admins only');
    const { getAdminFcmTokens } = await import('./adminService');
    const adminTokens = await getAdminFcmTokens();
    
    if (adminTokens.length === 0) {
      console.warn('[sendToAdminOnly] No admin tokens found');
      return { success: false, message: 'No admin tokens found' };
    }
    
    console.log('[sendToAdminOnly] Admin tokens found:', adminTokens.length);
    const result = await sendFcmNotification({ title, body, fcmTokens: adminTokens, data });
    console.log('[sendToAdminOnly] Notification sent successfully');
    return result;
  } catch (error) {
    console.error('[sendToAdminOnly] Error sending to admins:', error);
    throw error;
  }
}

/**
 * Send notification ONLY to a SPECIFIC CLIENT
 */
export async function sendToClientOnly(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<any> {
  try {
    console.log('[sendToClientOnly] Sending notification to client:', userId);
    const userTokens = await getUserFcmTokens(userId);
    
    if (userTokens.length === 0) {
      console.warn('[sendToClientOnly] No tokens found for client:', userId);
      return { success: false, message: 'No tokens found for client' };
    }
    
    console.log('[sendToClientOnly] Client tokens found:', userTokens.length);
    const result = await sendFcmNotification({ title, body, fcmTokens: userTokens, data });
    console.log('[sendToClientOnly] Notification sent successfully');
    return result;
  } catch (error) {
    console.error('[sendToClientOnly] Error sending to client:', error);
    throw error;
  }
}

/**
 * Send notification to a specific user (alias for sendToClientOnly for backward compatibility)
 */
export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<any> {
  return sendToClientOnly(userId, title, body, data);
}

/**
 * Send notification to all admins (alias for sendToAdminOnly for backward compatibility)
 */
export async function sendNotificationToAdmins(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<any> {
  return sendToAdminOnly(title, body, data);
}

/**
 * Send notification ONLY to ALL CLIENTS (for promotions)
 */
export async function sendToAllClients(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<any> {
  try {
    console.log('[sendToAllClients] Sending notification to all clients');
    const { getAllClientFcmTokens } = await import('./adminService');
    const clientTokens = await getAllClientFcmTokens();
    
    if (clientTokens.length === 0) {
      console.warn('[sendToAllClients] No client tokens found');
      return { success: false, message: 'No client tokens found' };
    }
    
    console.log('[sendToAllClients] Client tokens found:', clientTokens.length);
    const result = await sendFcmNotification({ title, body, fcmTokens: clientTokens, data });
    console.log('[sendToAllClients] Notification sent successfully');
    return result;
  } catch (error) {
    console.error('[sendToAllClients] Error sending to all clients:', error);
    throw error;
  }
}

/**
 * Send notification to all clients (alias for sendToAllClients for backward compatibility)
 */
export async function sendNotificationToAllClients(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<any> {
  return sendToAllClients(title, body, data);
}

/**
 * Send notification to a specific user (generic, but prefer role-specific functions)
 */
export async function sendToSpecificUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<any> {
  return sendToClientOnly(userId, title, body, data);
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!id) return;

  if (!isFirebaseConfigured()) {
    const items = safeGetLocal();
    const idx = items.findIndex((n) => n.id === id);
    if (idx < 0) return;
    items[idx] = { ...items[idx], readAt: Date.now() };
    safeSetLocal(items);
    return;
  }

  const db = getFirebaseDb();
  if (!db) return;
  await updateDoc(doc(db, 'notifications', id), { readAt: Date.now() });
}

export async function markNotificationDelivered(id: string): Promise<void> {
  if (!id) return;

  if (!isFirebaseConfigured()) {
    const items = safeGetLocal();
    const idx = items.findIndex((n) => n.id === id);
    if (idx < 0) return;
    items[idx] = { ...items[idx], deliveredAt: Date.now() };
    safeSetLocal(items);
    return;
  }

  const db = getFirebaseDb();
  if (!db) return;
  await updateDoc(doc(db, 'notifications', id), { deliveredAt: Date.now() });
}

function safeGetReminderIds(): string[] {
  try {
    const value = Taro.getStorageSync(reminderKey);
    return (value as string[]) || [];
  } catch (error) {
    console.error('[Notificacoes] falha ao ler lembretes locais', error);
    return [];
  }
}

function safeSetReminderIds(ids: string[]): void {
  try {
    Taro.setStorageSync(reminderKey, ids);
  } catch (error) {
    console.error('[Notificacoes] falha ao salvar lembretes locais', error);
  }
}

function safeGetStartReminderIds(): string[] {
  try {
    const value = Taro.getStorageSync(startReminderKey);
    return (value as string[]) || [];
  } catch (error) {
    console.error('[Notificacoes] falha ao ler lembretes de início locais', error);
    return [];
  }
}

function safeSetStartReminderIds(ids: string[]): void {
  try {
    Taro.setStorageSync(startReminderKey, ids);
  } catch (error) {
    console.error('[Notificacoes] falha ao salvar lembretes de início locais', error);
  }
}

async function playNotificationSound(): Promise<void> {
  try {
    if (process.env.TARO_ENV !== 'h5') return;
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.18);
    setTimeout(() => {
      try {
        oscillator.disconnect();
        gain.disconnect();
        ctx.close();
      } catch (e) {
        // ignore
      }
    }, 500);
  } catch (error) {
    console.warn('[Notificacoes] falha ao reproduzir som', error);
  }
}

export async function showSystemNotification(title: string, body: string, options?: ShowNotificationOptions): Promise<void> {
  try {
    console.log('[Notificacoes] Usando apenas Capacitor Push API para notificações', { title, body, options });
    // Notificações locais no Android são tratadas via Capacitor Push API
    // Para notificações locais, use o Firebase Admin SDK ou OneSignal
  } catch (error) {
    console.error('[Notificacoes] ERRO CRÍTICO no sistema de notificações', error);
  }
}

export function subscribeAdminNotifications(onChange: (items: InAppNotification[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    const items = safeGetLocal().filter((n) => n.target === 'admin').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    onChange(items);
    return () => {};
  }

  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, 'notifications'), where('target', '==', 'admin'));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<InAppNotification, 'id'>) }))
        .filter((n) => n.target === 'admin')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onChange(items);
    },
    (error) => {
      console.error('[Notificacoes] falha ao escutar notificações admin', error);
      onChange([]);
    },
  );

  return unsub;
}

export async function maybeSendAppointmentReminder(userId: string, appointments: Appointment[]): Promise<void> {
  if (!userId) return;
  if (!appointments.length) return;
  if (!getLocalSettings().notificationsEnabled) return;

  const now = Date.now();
  const reminderMinutes = 180;
  const target = appointments
    .filter((a) => a.userId === userId && a.status !== 'cancelado' && a.status !== 'recusado' && a.startAt > now)
    .sort((a, b) => a.startAt - b.startAt)[0];

  if (!target) return;

  const diffMs = target.startAt - now;
  const withinWindow = diffMs <= reminderMinutes * 60 * 1000 && diffMs >= 5 * 60 * 1000;
  if (!withinWindow) return;

  const sent = safeGetReminderIds();
  if (sent.includes(target.id)) return;

  try {
    const [clientNotificationId, adminNotificationId] = await Promise.all([
      createNotification({
        target: 'cliente',
        targetUserId: userId,
        type: 'lembrete_agendamento',
        title: 'Seu horário está chegando 💅',
        body: `Agendamento hoje\n${new Date(target.startAt).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}.`,
        appointmentId: target.id,
      }),
      createNotification({
        target: 'admin',
        type: 'lembrete_agendamento',
        title: 'Lembrete de atendimento',
        body: `Nova cliente confirmada\npara hoje às ${new Date(target.startAt).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}.`,
        appointmentId: target.id,
      }),
    ]);
    safeSetReminderIds([target.id, ...sent].slice(0, 50));
    await showSystemNotification('Seu horário está chegando 💅', `Você possui atendimento agendado hoje às ${new Date(target.startAt).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })}.`, {
      appointmentId: target.id,
      notificationId: clientNotificationId,
      url: `/pages/booking/index?appointmentId=${target.id}`,
    });
  } catch (error) {
    console.error('[Notificacoes] falha ao gerar lembrete', error);
  }
}

export async function maybeSendAppointmentStartNotification(userId: string, appointments: Appointment[]): Promise<void> {
  if (!userId) return;
  if (!appointments.length) return;
  if (!getLocalSettings().notificationsEnabled) return;

  const now = Date.now();
  const target = appointments
    .filter(
      (a) =>
        a.userId === userId &&
        a.status !== 'cancelado' &&
        a.status !== 'recusado' &&
        a.startAt > now - 2 * 60 * 1000 &&
        a.startAt <= now + 2 * 60 * 1000,
    )
    .sort((a, b) => a.startAt - b.startAt)[0];

  if (!target) return;

  const sent = safeGetStartReminderIds();
  if (sent.includes(target.id)) return;

  try {
    const clientNotificationId = await createNotification({
      target: 'cliente',
      targetUserId: userId,
      type: 'inicio_agendamento',
      title: 'Seu atendimento começou 💅',
      body: `Seu atendimento começou 💅\nClique em 'Estou a caminho' para avisar a manicure.`,
      appointmentId: target.id,
    });
    safeSetStartReminderIds([target.id, ...sent].slice(0, 50));
    await showSystemNotification('Seu atendimento começou 💅', `Seu atendimento começou 💅\nClique em 'Estou a caminho' para avisar a manicure.`, {
      appointmentId: target.id,
      notificationId: clientNotificationId,
      url: `/?notificationAction=on_my_way&appointmentId=${target.id}`,
      action: 'on_my_way',
    });
  } catch (error) {
    console.error('[Notificacoes] falha ao gerar notificação de início', error);
  }
}
