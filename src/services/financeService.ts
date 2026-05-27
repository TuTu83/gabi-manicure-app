import Taro from '@tarojs/taro';
import dayjs from 'dayjs';
import { addDoc, collection, getDocs, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { consumeRateLimit } from '@/services/storage';
import type { Appointment } from '@/types/booking';
import type { PaymentMethod, PaymentRecord } from '@/types/finance';
import type { UserProfile } from '@/types/user';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';

type Unsubscribe = () => void;

const localKey = 'gm.payments';

function safeGetLocal(): PaymentRecord[] {
  try {
    const value = Taro.getStorageSync(localKey);
    return (value as PaymentRecord[]) || [];
  } catch (error) {
    console.error('[Financeiro] falha ao ler pagamentos locais', error);
    return [];
  }
}

function safeSetLocal(items: PaymentRecord[]): void {
  try {
    Taro.setStorageSync(localKey, items);
  } catch (error) {
    console.error('[Financeiro] falha ao salvar pagamentos locais', error);
  }
}

export function startOfDayMs(dateMs: number): number {
  return dayjs(dateMs).startOf('day').valueOf();
}

export function endOfDayMs(dateMs: number): number {
  return dayjs(dateMs).endOf('day').valueOf();
}

export async function createPaymentFromAppointment(params: {
  appointment: Appointment;
  amountCents: number;
  method: PaymentMethod;
  adminUser: UserProfile;
}): Promise<PaymentRecord> {
  const { appointment, amountCents, method, adminUser } = params;
  if (!appointment?.id) throw new Error('Agendamento inválido');
  if (!adminUser?.id) throw new Error('Sessão expirada');
  if (amountCents <= 0) throw new Error('Informe um valor válido');

  const rl = consumeRateLimit({ key: `createPayment:${adminUser.id}`, max: 6, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitas ações seguidas. Aguarde alguns segundos e tente novamente.');

  const payload: Omit<PaymentRecord, 'id'> = {
    appointmentId: appointment.id,
    appointmentStatus: appointment.status,
    status: 'paid',
    userId: appointment.userId,
    userName: appointment.userName,
    phoneE164: appointment.phoneE164,
    serviceId: appointment.serviceId,
    serviceName: appointment.serviceName,
    professionalId: appointment.professionalId,
    professionalName: appointment.professionalName,
    amountCents,
    method,
    paidAt: Date.now(),
    createdAt: Date.now(),
    createdByUserId: adminUser.id,
    createdByEmail: adminUser.email || undefined,
  };

  if (!isFirebaseConfigured()) {
    const current = safeGetLocal();
    const record: PaymentRecord = { id: `local_${Date.now()}`, ...payload };
    safeSetLocal([record, ...current]);
    return record;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');

  const qDup = query(collection(db, 'payments'), where('appointmentId', '==', appointment.id), limit(1));
  const dup = await getDocs(qDup);
  if (!dup.empty) throw new Error('Este pagamento já foi registrado.');
  const ref = await addDoc(collection(db, 'payments'), payload);
  return { id: ref.id, ...payload };
}

export async function fetchPaymentByAppointmentId(appointmentId: string): Promise<PaymentRecord | null> {
  if (!appointmentId) return null;

  if (!isFirebaseConfigured()) {
    const all = safeGetLocal();
    return all.find((p) => p.appointmentId === appointmentId) || null;
  }

  const db = getFirebaseDb();
  if (!db) return null;
  const q = query(collection(db, 'payments'), where('appointmentId', '==', appointmentId), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...(docSnap.data() as Omit<PaymentRecord, 'id'>) };
}

export async function ensurePaymentForFinalizedAppointment(params: {
  appointment: Appointment;
  adminUser: UserProfile;
  amountCents?: number;
  method?: PaymentMethod;
}): Promise<PaymentRecord | null> {
  const amountCents = Number(params.amountCents ?? params.appointment.priceCents ?? 0);
  if (amountCents <= 0) return null;
  const method: PaymentMethod = (params.method || 'pix') as PaymentMethod;

  const existing = await fetchPaymentByAppointmentId(params.appointment.id);
  if (existing) return existing;

  try {
    return await createPaymentFromAppointment({
      appointment: params.appointment,
      amountCents,
      method,
      adminUser: params.adminUser,
    });
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (msg.includes('já foi registrado')) {
      return await fetchPaymentByAppointmentId(params.appointment.id);
    }
    throw error;
  }
}

export function subscribePaymentsRange(params: {
  startAt: number;
  endAt: number;
  method?: PaymentMethod | 'todas';
  maxItems?: number;
  onChange: (items: PaymentRecord[]) => void;
}): Unsubscribe {
  const { startAt, endAt, method, maxItems, onChange } = params;
  if (endAt <= startAt) {
    onChange([]);
    return () => {};
  }

  if (!isFirebaseConfigured()) {
    const all = safeGetLocal().filter((p) => p.paidAt >= startAt && p.paidAt <= endAt).filter((p) => !p.status || p.status === 'paid');
    const filtered = method && method !== 'todas' ? all.filter((p) => p.method === method) : all;
    onChange(filtered.sort((a, b) => b.paidAt - a.paidAt));
    return () => {};
  }

  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const clauses: any[] = [where('status', '==', 'paid'), where('paidAt', '>=', startAt), where('paidAt', '<=', endAt)];
  if (method && method !== 'todas') clauses.push(where('method', '==', method));

  const q = query(collection(db, 'payments'), ...clauses, orderBy('paidAt', 'desc'), limit(maxItems || 1200));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }));
      onChange(items);
    },
    (error) => {
      console.error('[Financeiro] falha ao escutar pagamentos', error);
      onChange([]);
    },
  );
  return unsub;
}

export async function fetchPaymentsRange(params: {
  startAt: number;
  endAt: number;
  method?: PaymentMethod | 'todas';
}): Promise<PaymentRecord[]> {
  const { startAt, endAt, method } = params;
  if (!isFirebaseConfigured()) {
    const all = safeGetLocal().filter((p) => p.paidAt >= startAt && p.paidAt <= endAt).filter((p) => !p.status || p.status === 'paid');
    const filtered = method && method !== 'todas' ? all.filter((p) => p.method === method) : all;
    return filtered.sort((a, b) => b.paidAt - a.paidAt);
  }

  const db = getFirebaseDb();
  if (!db) return [];

  const clauses: any[] = [where('status', '==', 'paid'), where('paidAt', '>=', startAt), where('paidAt', '<=', endAt)];
  if (method && method !== 'todas') clauses.push(where('method', '==', method));
  const q = query(collection(db, 'payments'), ...clauses, orderBy('paidAt', 'desc'), limit(5000));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }));
}

export async function fetchPaymentsRangePage(params: {
  startAt: number;
  endAt: number;
  method?: PaymentMethod | 'todas';
  pageSize?: number;
  afterPaidAt?: number | null;
  afterCursor?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<{ items: PaymentRecord[]; nextAfterPaidAt: number | null; nextAfterCursor: QueryDocumentSnapshot<DocumentData> | null }> {
  const { startAt, endAt, method, pageSize, afterPaidAt, afterCursor } = params;
  const size = Math.max(50, Math.min(500, Number(pageSize) || 200));

  if (!isFirebaseConfigured()) {
    const all = safeGetLocal().filter((p) => p.paidAt >= startAt && p.paidAt <= endAt).filter((p) => !p.status || p.status === 'paid');
    const filtered = method && method !== 'todas' ? all.filter((p) => p.method === method) : all;
    const sorted = filtered.sort((a, b) => b.paidAt - a.paidAt);
    const sliced = afterPaidAt ? sorted.filter((p) => p.paidAt < afterPaidAt).slice(0, size) : sorted.slice(0, size);
    const next = sliced.length ? sliced[sliced.length - 1].paidAt : null;
    return { items: sliced, nextAfterPaidAt: next, nextAfterCursor: null };
  }

  const db = getFirebaseDb();
  if (!db) return { items: [], nextAfterPaidAt: null, nextAfterCursor: null };

  const clauses: any[] = [where('status', '==', 'paid'), where('paidAt', '>=', startAt), where('paidAt', '<=', endAt)];
  if (method && method !== 'todas') clauses.push(where('method', '==', method));

  const qBase = query(collection(db, 'payments'), ...clauses, orderBy('paidAt', 'desc'));
  const q = afterCursor ? query(qBase, startAfter(afterCursor), limit(size)) : afterPaidAt ? query(qBase, startAfter(afterPaidAt), limit(size)) : query(qBase, limit(size));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentRecord, 'id'>) }));
  const nextAfterPaidAtValue = items.length ? items[items.length - 1].paidAt : null;
  const nextAfterCursorValue = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
  return { items, nextAfterPaidAt: nextAfterPaidAtValue, nextAfterCursor: nextAfterCursorValue };
}

export async function fetchPaymentsRangeAll(params: {
  startAt: number;
  endAt: number;
  method?: PaymentMethod | 'todas';
  pageSize?: number;
  maxItems?: number;
}): Promise<PaymentRecord[]> {
  const size = Math.max(100, Math.min(500, Number(params.pageSize) || 400));
  const maxItems = Math.max(2000, Math.min(50000, Number(params.maxItems) || 50000));

  const items: PaymentRecord[] = [];
  let afterPaidAt: number | null = null;
  let afterCursor: QueryDocumentSnapshot<DocumentData> | null = null;

  for (let i = 0; i < 250; i += 1) {
    const page = await fetchPaymentsRangePage({
      startAt: params.startAt,
      endAt: params.endAt,
      method: params.method,
      pageSize: size,
      afterPaidAt,
      afterCursor,
    });
    if (!page.items.length) break;
    for (const it of page.items) {
      items.push(it);
      if (items.length >= maxItems) return items;
    }
    afterPaidAt = page.nextAfterPaidAt;
    afterCursor = page.nextAfterCursor;
    if (!afterPaidAt) break;
  }
  return items;
}

export async function fetchPaymentsRangeAggregate(params: {
  startAt: number;
  endAt: number;
  method?: PaymentMethod | 'todas';
}): Promise<{
  totalCents: number;
  count: number;
  topServices: Array<{ label: string; cents: number }>;
  topClients: Array<{ label: string; cents: number }>;
  daySeries: Array<{ dayMs: number; cents: number }>;
  monthSeries: Array<{ monthMs: number; cents: number }>;
}> {
  const { startAt, endAt, method } = params;
  const byService: Record<string, number> = {};
  const byClient: Record<string, number> = {};
  const byDayMs: Record<string, number> = {};
  const byMonthMs: Record<string, number> = {};

  let totalCents = 0;
  let count = 0;

  let afterPaidAt: number | null = null;
  let afterCursor: QueryDocumentSnapshot<DocumentData> | null = null;
  for (let i = 0; i < 250; i += 1) {
    const page = await fetchPaymentsRangePage({ startAt, endAt, method, pageSize: 450, afterPaidAt, afterCursor });
    if (!page.items.length) break;

    for (const p of page.items) {
      count += 1;
      const cents = p.amountCents || 0;
      totalCents += cents;

      const svc = p.serviceName || 'Serviço';
      const cli = p.userName || 'Cliente';
      byService[svc] = (byService[svc] || 0) + cents;
      byClient[cli] = (byClient[cli] || 0) + cents;

      const dayMs = dayjs(p.paidAt).startOf('day').valueOf();
      byDayMs[String(dayMs)] = (byDayMs[String(dayMs)] || 0) + cents;

      const monthMs = dayjs(p.paidAt).startOf('month').valueOf();
      byMonthMs[String(monthMs)] = (byMonthMs[String(monthMs)] || 0) + cents;
    }

    afterPaidAt = page.nextAfterPaidAt;
    afterCursor = page.nextAfterCursor;
    if (!afterPaidAt) break;
  }

  const topServices = Object.entries(byService)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, cents]) => ({ label, cents }));
  const topClients = Object.entries(byClient)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, cents]) => ({ label, cents }));
  const daySeries = Object.entries(byDayMs)
    .map(([ms, cents]) => ({ dayMs: Number(ms), cents }))
    .sort((a, b) => a.dayMs - b.dayMs);
  const monthSeries = Object.entries(byMonthMs)
    .map(([ms, cents]) => ({ monthMs: Number(ms), cents }))
    .sort((a, b) => a.monthMs - b.monthMs);

  return { totalCents, count, topServices, topClients, daySeries, monthSeries };
}
