import Taro from '@tarojs/taro';
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import type { Appointment, InAppNotification, NotificationType } from '@/types/booking';
import { getLocalSettings } from '@/services/settingsService';

type Unsubscribe = () => void;

const localKey = 'gm.notifications';
const reminderKey = 'gm.reminders.sent';

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

  const q = query(
    collection(db, 'notifications'),
    where('target', '==', 'cliente'),
    where('targetUserId', '==', userId),
    orderBy('createdAt', 'desc'),
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InAppNotification, 'id'>) }));
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
}): Promise<void> {
  const payload: Omit<InAppNotification, 'id'> = {
    target: params.target,
    targetUserId: params.targetUserId,
    type: params.type,
    title: params.title,
    body: params.body,
    createdAt: Date.now(),
    appointmentId: params.appointmentId,
  };

  if (!isFirebaseConfigured()) {
    const current = safeGetLocal();
    const next: InAppNotification = { id: `local_${Date.now()}`, ...payload };
    safeSetLocal([next, ...current]);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  await addDoc(collection(db, 'notifications'), payload);
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

export async function maybeSendAppointmentReminder(userId: string, appointments: Appointment[]): Promise<void> {
  if (!userId) return;
  if (!appointments.length) return;
  if (!getLocalSettings().notificationsEnabled) return;

  const now = Date.now();
  const reminderMinutes = Math.max(5, getLocalSettings().reminderMinutes || 120);
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
    await createNotification({
      target: 'cliente',
      targetUserId: userId,
      type: 'lembrete_agendamento',
      title: 'Lembrete de horário',
      body: `Seu horário de ${target.serviceName} é hoje às ${new Date(target.startAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}.`,
      appointmentId: target.id,
    });
    safeSetReminderIds([target.id, ...sent].slice(0, 50));
  } catch (error) {
    console.error('[Notificacoes] falha ao gerar lembrete', error);
  }
}
