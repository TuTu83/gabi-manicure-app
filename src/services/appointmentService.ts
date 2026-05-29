import Taro from '@tarojs/taro';
import dayjs from 'dayjs';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  getDoc,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { removeUndefinedFields } from '@/services/firebase';
import { getLocalSettings } from '@/services/settingsService';
import { consumeRateLimit } from '@/services/storage';
import { ensurePaymentForFinalizedAppointment } from '@/services/financeService';
import type { Appointment, AppointmentReview, AppointmentStatus, LoyaltySummary, WaitlistEntry } from '@/types/booking';
import type { PaymentMethod } from '@/types/finance';
import type { UserProfile } from '@/types/user';

const appointmentsKey = 'gm.appointments';
const reviewsKey = 'gm.reviews';
const waitlistKey = 'gm.waitlist';

async function getAdminFcmToken(): Promise<string | null> {
  try {
    console.log('[getAdminFcmToken] Starting...');
    const db = getFirebaseDb();
    if (!db) {
      console.error('[getAdminFcmToken] Firebase DB not available');
      return null;
    }
    
    const q = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
    const snap = await getDocs(q);
    
    console.log('[getAdminFcmToken] Found', snap.size, 'admin users');
    
    if (!snap.empty) {
      const adminData = snap.docs[0].data() as UserProfile;
      const token = adminData.fcmToken || null;
      console.log('[getAdminFcmToken] Admin FCM token:', token ? 'found' : 'NOT FOUND');
      console.log('[getAdminFcmToken] Admin data:', adminData);
      return token;
    }
    console.error('[getAdminFcmToken] No admin user found!');
    return null;
  } catch (error) {
    console.error('[getAdminFcmToken] Error getting admin FCM token:', error);
    return null;
  }
}

async function getUserFcmToken(userId: string): Promise<string | null> {
  try {
    console.log('[getUserFcmToken] Starting for user:', userId);
    const db = getFirebaseDb();
    if (!db) {
      console.error('[getUserFcmToken] Firebase DB not available');
      return null;
    }
    
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data() as UserProfile;
      const token = userData.fcmToken || null;
      console.log('[getUserFcmToken] User FCM token:', token ? 'found' : 'NOT FOUND');
      console.log('[getUserFcmToken] User data:', userData);
      return token;
    }
    console.error('[getUserFcmToken] User not found:', userId);
    return null;
  } catch (error) {
    console.error('[getUserFcmToken] Error getting user FCM token:', error);
    return null;
  }
}

async function sendFcmNotification({
  title,
  body,
  fcmTokens,
  data = {},
}: {
  title: string;
  body: string;
  fcmTokens: string[];
  data?: Record<string, any>;
}) {
  try {
    // Use the full production URL for the API
    const apiUrl = 'https://gabi-manicure-app.vercel.app/api/send-notification';
    console.log('[sendFcmNotification] Sending to:', apiUrl);
    console.log('[sendFcmNotification] Payload:', { title, body, fcmTokens, data });
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, fcmTokens, data }),
    });
    
    console.log('[sendFcmNotification] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[sendFcmNotification] API error response:', errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('[sendFcmNotification] Success:', result);
    return result;
  } catch (error) {
    console.error('[sendFcmNotification] Error sending FCM notification:', error);
    throw error;
  }
}

type Unsubscribe = () => void;

function safeGetArray<T>(key: string): T[] {
  try {
    const value = Taro.getStorageSync(key);
    return (value as T[]) || [];
  } catch (error) {
    console.error('[Agendamento] falha ao ler armazenamento local', error);
    return [];
  }
}

function safeSetArray<T>(key: string, value: T[]): void {
  try {
    Taro.setStorageSync(key, value);
  } catch (error) {
    console.error('[Agendamento] falha ao salvar armazenamento local', error);
  }
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function dateKeyFromMs(ms: number): string {
  return dayjs(ms).format('YYYY-MM-DD');
}

export function formatTime(ms: number): string {
  return dayjs(ms).format('HH:mm');
}

export function formatDateLabel(ms: number): string {
  return dayjs(ms).format('DD/MM/YYYY');
}

export function priceFromCents(cents: number): string {
  const value = (cents || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildSlotsForDay(params: {
  dateMs: number;
  durationMinutes: number;
  busy: Array<{ startAt: number; endAt: number; status: AppointmentStatus }>;
}): Array<{ startAt: number; endAt: number; disabled: boolean; reason?: string }> {
  const { dateMs, durationMinutes, busy } = params;
  const dayStart = dayjs(dateMs).startOf('day');
  const now = Date.now();
  const hours = getLocalSettings().businessHours;
  const workingDays = getLocalSettings().workingDays || [1, 2, 3, 4, 5, 6];
  const weekday = dayStart.day();
  if (!workingDays.includes(weekday)) return [];

  const openAt = dayStart.hour(hours.openHour).minute(0).second(0).millisecond(0);
  const closeAt = dayStart.hour(hours.closeHour).minute(0).second(0).millisecond(0);

  const stepMinutes = 15;
  const slots: Array<{ startAt: number; endAt: number; disabled: boolean; reason?: string }> = [];

  for (
    let cursor = openAt.valueOf();
    cursor + durationMinutes * 60 * 1000 <= closeAt.valueOf();
    cursor += stepMinutes * 60 * 1000
  ) {
    const startAt = cursor;
    const endAt = cursor + durationMinutes * 60 * 1000;

    const isPast = endAt <= now;
    const hasConflict = busy.some(
      (b) => b.status !== 'cancelado' && b.status !== 'recusado' && overlaps(startAt, endAt, b.startAt, b.endAt),
    );

    if (isPast) {
      slots.push({ startAt, endAt, disabled: true, reason: 'Horário passado' });
      continue;
    }
    if (hasConflict) {
      slots.push({ startAt, endAt, disabled: true, reason: 'Ocupado' });
      continue;
    }
    slots.push({ startAt, endAt, disabled: false });
  }

  return slots;
}

export function subscribeUserAppointments(userId: string, onChange: (items: Appointment[]) => void): Unsubscribe {
  if (!userId) {
    onChange([]);
    return () => {};
  }

  if (!isFirebaseConfigured()) {
    const items = safeGetArray<Appointment>(appointmentsKey).filter((a) => a.userId === userId);
    onChange(items.sort((a, b) => b.startAt - a.startAt));
    return () => {};
  }

  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, 'appointments'), where('userId', '==', userId));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }))
        .sort((a, b) => b.startAt - a.startAt);
      onChange(items);
    },
    (error) => {
      console.error('[Agendamento] falha ao escutar agendamentos', error);
      onChange([]);
    },
  );
  return unsub;
}

export function subscribeBusyForProfessionalDay(params: {
  professionalId: string;
  dateMs: number;
  onChange: (items: Array<{ startAt: number; endAt: number; status: AppointmentStatus }>) => void;
}): Unsubscribe {
  const { professionalId, dateMs, onChange } = params;

  const start = dayjs(dateMs).startOf('day').valueOf();
  const end = dayjs(dateMs).endOf('day').valueOf();

  if (!professionalId) {
    onChange([]);
    return () => {};
  }

  if (!isFirebaseConfigured()) {
    const items = safeGetArray<Appointment>(appointmentsKey)
      .filter((a) => a.professionalId === professionalId && overlaps(a.startAt, a.endAt, start, end))
      .map((a) => ({ startAt: a.startAt, endAt: a.endAt, status: a.status }));
    onChange(items);
    return () => {};
  }

  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(db, 'appointments'),
    where('startAt', '>=', start),
    where('startAt', '<=', end),
    orderBy('startAt', 'asc'),
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as Appointment)
        .filter((a) => a.professionalId === professionalId)
        .map((a) => ({ startAt: a.startAt, endAt: a.endAt, status: a.status }));
      onChange(items);
    },
    (error) => {
      console.error('[Agendamento] falha ao escutar agenda do dia', error);
      onChange([]);
    },
  );

  return unsub;
}

export async function createAppointment(input: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Appointment> {
  console.log('[createAppointment] Starting with input:', input);
  const startAt = input.startAt;
  const endAt = input.endAt;
  if (endAt <= Date.now()) throw new Error('Não é possível agendar em horário passado');
  if (!input.userId) throw new Error('Sessão expirada');

  const rl = consumeRateLimit({ key: `createAppointment:${input.userId}`, max: 2, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitas tentativas seguidas. Aguarde alguns segundos e tente novamente.');

  if (!isFirebaseConfigured()) {
    const all = safeGetArray<Appointment>(appointmentsKey);
    const hasConflict = all.some(
      (a) =>
        a.professionalId === input.professionalId &&
        a.status !== 'cancelado' &&
        a.status !== 'recusado' &&
        overlaps(startAt, endAt, a.startAt, a.endAt),
    );
    if (hasConflict) throw new Error('Este horário acabou de ser ocupado. Escolha outro horário.');

    const appointment: Appointment = {
      ...input,
      id: `local_${Date.now()}`,
      status: 'pendente',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    safeSetArray(appointmentsKey, [appointment, ...all]);
    return appointment;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');

  try {
    const threshold = Date.now() - 15_000;
    const qUser = query(collection(db, 'appointments'), where('createdAt', '>=', threshold), orderBy('createdAt', 'desc'), limit(30));
    const snapUser = await getDocs(qUser);
    const tooSoon = snapUser.docs.some((d) => {
      const a = d.data() as Appointment;
      if (a.userId !== input.userId) return false;
      return (a.createdAt || 0) >= threshold && a.status !== 'cancelado' && a.status !== 'recusado';
    });
    if (tooSoon) throw new Error('Você acabou de solicitar um agendamento. Aguarde alguns segundos e tente novamente.');
  } catch (error: any) {
    if (String(error?.message || '').includes('Aguarde alguns segundos')) throw error;
  }

  const appointment = await runTransaction(db, async (tx) => {
    const start = dayjs(startAt).startOf('day').valueOf();
    const end = dayjs(startAt).endOf('day').valueOf();
    const q = query(
      collection(db, 'appointments'),
      where('startAt', '>=', start),
      where('startAt', '<=', end),
      orderBy('startAt', 'asc'),
    );
    const snap = await getDocs(q);

    const conflicts = snap.docs.some((d) => {
      const data = d.data() as Appointment;
      if (data.professionalId !== input.professionalId) return false;
      if (data.status === 'cancelado' || data.status === 'recusado') return false;
      return overlaps(startAt, endAt, data.startAt, data.endAt);
    });
    if (conflicts) throw new Error('Este horário acabou de ser ocupado. Escolha outro horário.');

    const ref = doc(collection(db, 'appointments'));
    const payloadRaw: Omit<Appointment, 'id'> = {
      ...input,
      status: 'pendente',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const payload = removeUndefinedFields(payloadRaw);
    tx.set(ref, payload as any);
    return { id: ref.id, ...(payload as any) };
  });

  // Send FCM notifications
  console.log('[createAppointment] Preparing to send FCM notifications...');
  try {
    const adminFcmToken = await getAdminFcmToken();
    const clientFcmToken = await getUserFcmToken(input.userId);
    
    const dateStr = dayjs(startAt).format('DD/MM/YYYY');
    const timeStr = dayjs(startAt).format('HH:mm');
    
    const tokensToSend: string[] = [];
    if (adminFcmToken) tokensToSend.push(adminFcmToken);
    if (clientFcmToken) tokensToSend.push(clientFcmToken);
    
    console.log('[createAppointment] Tokens to send:', tokensToSend);
    
    if (tokensToSend.length > 0) {
      console.log('[createAppointment] Calling sendFcmNotification...');
      await sendFcmNotification({
        title: 'Novo Agendamento!',
        body: `${input.clientName} agendou para ${dateStr} às ${timeStr}`,
        fcmTokens: tokensToSend,
        data: {
          type: 'new_appointment',
          appointmentId: appointment.id,
          url: '/pages/admin/index',
        },
      });
      console.log('[createAppointment] sendFcmNotification completed');
    } else {
      console.warn('[createAppointment] No tokens to send!');
    }
  } catch (error) {
    console.error('[createAppointment] Error sending FCM notifications for new appointment:', error);
  }

  return appointment;
}

export async function cancelAppointment(appointmentId: string): Promise<void> {
  console.log('[cancelAppointment] Starting with appointmentId:', appointmentId);
  if (!appointmentId) return;
  const rl = consumeRateLimit({ key: `cancelAppointment:${appointmentId}`, max: 2, windowMs: 8000 });
  if (!rl.allowed) throw new Error('Muitas ações seguidas. Aguarde alguns segundos e tente novamente.');

  if (!isFirebaseConfigured()) {
    const all = safeGetArray<Appointment>(appointmentsKey);
    const idx = all.findIndex((a) => a.id === appointmentId);
    if (idx < 0) return;
    const next = { ...all[idx], status: 'cancelado' as const, canceledAt: Date.now(), updatedAt: Date.now() };
    all[idx] = next;
    safeSetArray(appointmentsKey, all);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  
  // First get the appointment data to get details for notification
  let appointmentData: Appointment | null = null;
  try {
    const appointmentDoc = await getDoc(doc(db, 'appointments', appointmentId));
    if (appointmentDoc.exists()) {
      appointmentData = { id: appointmentDoc.id, ...(appointmentDoc.data() as Omit<Appointment, 'id'>) };
    }
  } catch (error) {
    console.error('Error getting appointment for cancellation notification:', error);
  }

  await updateDoc(doc(db, 'appointments', appointmentId), {
    status: 'cancelado',
    canceledAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Send FCM notifications for cancellation
  console.log('[cancelAppointment] Preparing to send FCM notifications...');
  if (appointmentData) {
    try {
      const adminFcmToken = await getAdminFcmToken();
      const clientFcmToken = await getUserFcmToken(appointmentData.userId);
      
      const dateStr = dayjs(appointmentData.startAt).format('DD/MM/YYYY');
      const timeStr = dayjs(appointmentData.startAt).format('HH:mm');
      
      const tokensToSend: string[] = [];
      if (adminFcmToken) tokensToSend.push(adminFcmToken);
      if (clientFcmToken) tokensToSend.push(clientFcmToken);
      
      console.log('[cancelAppointment] Tokens to send:', tokensToSend);
      
      if (tokensToSend.length > 0) {
        console.log('[cancelAppointment] Calling sendFcmNotification...');
        await sendFcmNotification({
          title: 'Agendamento Cancelado',
          body: `${appointmentData.clientName} cancelou o agendamento de ${dateStr} às ${timeStr}`,
          fcmTokens: tokensToSend,
          data: {
            type: 'appointment_cancelled',
            appointmentId,
            url: '/pages/admin/index',
          },
        });
        console.log('[cancelAppointment] sendFcmNotification completed');
      } else {
        console.warn('[cancelAppointment] No tokens to send!');
      }
    } catch (error) {
      console.error('[cancelAppointment] Error sending FCM notifications for cancellation:', error);
    }
  } else {
    console.warn('[cancelAppointment] No appointment data found!');
  }
}

export async function setAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  options?: {
    actor?: UserProfile;
    appointment?: Appointment;
    payment?: { method?: PaymentMethod; amountCents?: number };
  },
): Promise<void> {
  if (!appointmentId) return;
  const now = Date.now();
  const shouldEnsurePayment = status === 'concluido';

  if (!isFirebaseConfigured()) {
    const all = safeGetArray<Appointment>(appointmentsKey);
    const idx = all.findIndex((a) => a.id === appointmentId);
    if (idx < 0) return;
    const next: Appointment = { ...all[idx], status, updatedAt: now };
    if (status === 'concluido') next.completedAt = now;
    all[idx] = next;
    safeSetArray(appointmentsKey, all);

    if (shouldEnsurePayment && options?.actor) {
      await ensurePaymentForFinalizedAppointment({
        appointment: next,
        adminUser: options.actor,
        amountCents: options.payment?.amountCents,
        method: options.payment?.method,
      });
    }
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  const patch: any = { status, updatedAt: now };
  if (status === 'concluido') patch.completedAt = now;
  await updateDoc(doc(db, 'appointments', appointmentId), patch);

  if (shouldEnsurePayment) {
    const actor = options?.actor;
    if (!actor) return;

    const base = options?.appointment;
    if (!base) return;

    const normalized: Appointment = { ...base, status, updatedAt: now, completedAt: now };
    await ensurePaymentForFinalizedAppointment({
      appointment: normalized,
      adminUser: actor,
      amountCents: options.payment?.amountCents,
      method: options.payment?.method,
    });
  }
}

export async function setAppointmentNotes(appointmentId: string, notes: string): Promise<void> {
  if (!appointmentId) return;
  const value = (notes || '').trim();
  const now = Date.now();

  if (!isFirebaseConfigured()) {
    const all = safeGetArray<Appointment>(appointmentsKey);
    const idx = all.findIndex((a) => a.id === appointmentId);
    if (idx < 0) return;
    all[idx] = { ...all[idx], notes: value || undefined, updatedAt: now };
    safeSetArray(appointmentsKey, all);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  await updateDoc(doc(db, 'appointments', appointmentId), { notes: value || null, updatedAt: now });
}

export async function markOnMyWay(appointmentId: string): Promise<void> {
  if (!appointmentId) return;
  const now = Date.now();
  const rl = consumeRateLimit({ key: `onMyWay:${appointmentId}`, max: 1, windowMs: 10000 });
  if (!rl.allowed) throw new Error('Aguarde alguns segundos para enviar novamente.');

  if (!isFirebaseConfigured()) {
    const all = safeGetArray<Appointment>(appointmentsKey);
    const idx = all.findIndex((a) => a.id === appointmentId);
    if (idx < 0) return;
    all[idx] = { ...all[idx], onMyWayAt: now, updatedAt: now };
    safeSetArray(appointmentsKey, all);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  
  // First get the appointment data for notification
  let appointmentData: Appointment | null = null;
  try {
    const appointmentDoc = await getDoc(doc(db, 'appointments', appointmentId));
    if (appointmentDoc.exists()) {
      appointmentData = { id: appointmentDoc.id, ...(appointmentDoc.data() as Omit<Appointment, 'id'>) };
    }
  } catch (error) {
    console.error('Error getting appointment for on-my-way notification:', error);
  }

  await updateDoc(doc(db, 'appointments', appointmentId), { onMyWayAt: now, updatedAt: now });

  // Send OneSignal notification to admin when client is on the way
  if (appointmentData) {
    try {
      const adminPlayerId = await getAdminPlayerId();
      const timeStr = dayjs(appointmentData.startAt).format('HH:mm');
      
      if (adminPlayerId) {
        await sendOneSignalNotification({
          title: 'Cliente está a caminho!',
          body: `${appointmentData.clientName} está a caminho para o horário de ${timeStr}!`,
          playerIds: [adminPlayerId],
          data: {
            type: 'client_on_my_way',
            appointmentId,
            url: '/pages/admin/index',
          },
        });
      }
    } catch (error) {
      console.error('Error sending OneSignal notification for on-my-way:', error);
    }
  }
}

export async function rescheduleAppointment(params: {
  appointmentId: string;
  professionalId: string;
  startAt: number;
  endAt: number;
  professionalName: string;
}): Promise<void> {
  const { appointmentId, professionalId, startAt, endAt, professionalName } = params;
  if (!appointmentId) return;
  if (endAt <= Date.now()) throw new Error('Não é possível reagendar para horário passado');
  const rl = consumeRateLimit({ key: `reschedule:${appointmentId}`, max: 2, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitas ações seguidas. Aguarde alguns segundos e tente novamente.');

  if (!isFirebaseConfigured()) {
    const all = safeGetArray<Appointment>(appointmentsKey);
    const idx = all.findIndex((a) => a.id === appointmentId);
    if (idx < 0) return;
    const current = all[idx];
    const hasConflict = all.some(
      (a) =>
        a.id !== appointmentId &&
        a.professionalId === professionalId &&
        a.status !== 'cancelado' &&
        a.status !== 'recusado' &&
        overlaps(startAt, endAt, a.startAt, a.endAt),
    );
    if (hasConflict) throw new Error('Este horário acabou de ser ocupado. Escolha outro horário.');

    all[idx] = {
      ...current,
      professionalId,
      professionalName,
      startAt,
      endAt,
      status: 'pendente',
      updatedAt: Date.now(),
    };
    safeSetArray(appointmentsKey, all);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');

  await runTransaction(db, async (tx) => {
    const start = dayjs(startAt).startOf('day').valueOf();
    const end = dayjs(startAt).endOf('day').valueOf();
    const q = query(
      collection(db, 'appointments'),
      where('startAt', '>=', start),
      where('startAt', '<=', end),
      orderBy('startAt', 'asc'),
    );
    const snap = await getDocs(q);
    const conflicts = snap.docs.some((d) => {
      if (d.id === appointmentId) return false;
      const data = d.data() as Appointment;
      if (data.professionalId !== professionalId) return false;
      if (data.status === 'cancelado' || data.status === 'recusado') return false;
      return overlaps(startAt, endAt, data.startAt, data.endAt);
    });
    if (conflicts) throw new Error('Este horário acabou de ser ocupado. Escolha outro horário.');

    tx.update(doc(db, 'appointments', appointmentId), {
      professionalId,
      professionalName,
      startAt,
      endAt,
      status: 'pendente',
      updatedAt: Date.now(),
    });
  });
}

export async function saveReview(input: Omit<AppointmentReview, 'id' | 'createdAt'>): Promise<AppointmentReview> {
  if (!input.appointmentId) throw new Error('Agendamento inválido');
  if (input.rating < 1 || input.rating > 5) throw new Error('Selecione de 1 a 5 estrelas');

  if (!isFirebaseConfigured()) {
    const all = safeGetArray<AppointmentReview>(reviewsKey);
    const review: AppointmentReview = { ...input, id: `local_${Date.now()}`, createdAt: Date.now() };
    safeSetArray(reviewsKey, [review, ...all]);
    return review;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');

  const ref = doc(collection(db, 'reviews'));
  const payload: Omit<AppointmentReview, 'id'> = { ...input, createdAt: Date.now() };
  await setDoc(ref, payload);
  return { id: ref.id, ...payload };
}

export async function createWaitlistEntry(input: Omit<WaitlistEntry, 'id' | 'createdAt'>): Promise<WaitlistEntry> {
  if (!input.userId) throw new Error('Sessão expirada');
  if (!input.dateKey) throw new Error('Data inválida');
  const rl = consumeRateLimit({ key: `waitlist:${input.userId}`, max: 2, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitas solicitações seguidas. Aguarde alguns segundos e tente novamente.');

  if (!isFirebaseConfigured()) {
    const all = safeGetArray<WaitlistEntry>(waitlistKey);
    const exists = all.some(
      (w) =>
        w.userId === input.userId &&
        w.dateKey === input.dateKey &&
        w.serviceId === input.serviceId &&
        w.professionalId === input.professionalId,
    );
    if (exists) throw new Error('Você já está na lista de espera para esta data');
    const entry: WaitlistEntry = { ...input, id: `local_${Date.now()}`, createdAt: Date.now() };
    safeSetArray(waitlistKey, [entry, ...all]);
    return entry;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');

  const ref = doc(collection(db, 'waitlist'));
  const payload = { ...input, createdAt: Date.now() };
  await setDoc(ref, payload);
  return { id: ref.id, ...(payload as Omit<WaitlistEntry, 'id'>) };
}

export function computeLoyalty(appointments: Appointment[]): LoyaltySummary {
  const points = appointments.filter((a) => a.status === 'concluido').length;
  const nextRewardAt = 10;
  return { points, nextRewardAt };
}
