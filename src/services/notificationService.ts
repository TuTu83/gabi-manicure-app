import Taro from '@tarojs/taro';
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured, removeUndefinedFields } from '@/services/firebase';
import type { Appointment, InAppNotification, NotificationType } from '@/types/booking';
import { getLocalSettings } from '@/services/settingsService';

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
    if (process.env.TARO_ENV === 'h5') {
      const anyWindow = window as any;
      if (anyWindow?.Notification?.requestPermission) {
        await anyWindow.Notification.requestPermission();
      }
      return;
    }

    if (process.env.TARO_ENV === 'weapp') {
      await Taro.requestSubscribeMessage({ tmplIds: [] });
    }
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
}): Promise<string | undefined> {
  const payloadRaw: Omit<InAppNotification, 'id'> & { deliveredAt?: number } = {
    target: params.target,
    targetUserId: params.targetUserId,
    type: params.type,
    title: params.title,
    body: params.body,
    createdAt: Date.now(),
    appointmentId: params.appointmentId,
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
    if (process.env.TARO_ENV === 'h5') {
      const anyWindow = window as any;
      if (!anyWindow.Notification) {
        console.warn('[Notificacoes] API Notification não disponível');
        return;
      }
      if (anyWindow.Notification.permission !== 'granted') {
        console.warn('[Notificacoes] permissão de notificações não concedida', anyWindow.Notification.permission);
        return;
      }

      const notificationOptions: any = {
        body,
        icon: '/icon.svg',
        badge: '/icon.svg',
        silent: false,
        renotify: true,
        tag: options?.notificationId || `gm-notification-${Date.now()}`,
        requireInteraction: true,
        vibrate: [200, 100, 200],
        timestamp: Date.now(),
        data: {
          url: options?.url || '/?notificationSource=gm',
          appointmentId: options?.appointmentId,
          notificationId: options?.notificationId,
        },
      };
      if (options?.action) {
        notificationOptions.actions = [
          {
            action: options.action,
            title: 'Estou a caminho',
          },
        ];
      }

      let notificationDisplayed = false;
      
      if (navigator.serviceWorker) {
        try {
          const registration = await navigator.serviceWorker.ready;
          if (registration?.showNotification) {
            await registration.showNotification(title, notificationOptions);
            notificationDisplayed = true;
            console.log('[Notificacoes] exibida VIA SERVICE WORKER (PUSH REAL)');
          }
        } catch (error) {
          console.error('[Notificacoes] ERRO CRÍTICO ao exibir via service worker', error);
        }
      }

      if (!notificationDisplayed) {
        console.warn('[Notificacoes] Service Worker indisponível, usando fallback');
        try {
          new Notification(title, notificationOptions);
          notificationDisplayed = true;
        } catch (error) {
          console.error('[Notificacoes] falha no fallback', error);
        }
      }

      if (notificationDisplayed) {
        try {
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }
        } catch (error) {
          console.warn('[Notificacoes] falha ao vibrar', error);
        }
        await playNotificationSound();
        if (options?.notificationId) {
          await markNotificationDelivered(options.notificationId);
        }
      }
      return;
    }

    if (process.env.TARO_ENV === 'weapp') {
      Taro.showToast({ title: body, icon: 'none' });
      if (Taro.vibrateLong) {
        Taro.vibrateLong();
      }
    }
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
