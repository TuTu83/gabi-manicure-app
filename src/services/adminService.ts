import Taro from '@tarojs/taro';
import dayjs from 'dayjs';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { consumeRateLimit } from '@/services/storage';
import type { Appointment, AppointmentStatus, Promotion, ServiceItem } from '@/types/booking';
import type { UserProfile } from '@/types/user';

type Unsubscribe = () => void;

const defaultAdminEmails = ['suporte.gabimanicure@gmail.com'];
const localUsersKey = 'gm.users';

export async function getAdminEmails(): Promise<string[]> {
  const base = defaultAdminEmails.map((e) => (e || '').trim().toLowerCase()).filter(Boolean);
  if (!isFirebaseConfigured()) return base;
  const db = getFirebaseDb();
  if (!db) return base;

  try {
    const snap = await getDoc(doc(db, 'admin', 'config'));
    if (!snap.exists()) return base;
    const emails = (snap.data() as any).emails as string[] | undefined;
    const normalized = (emails || []).map((e) => (e || '').trim().toLowerCase()).filter(Boolean);
    return Array.from(new Set([...base, ...normalized]));
  } catch (error) {
    console.error('[Admin] falha ao ler configuração de admin', error);
    return base;
  }
}

export async function isAdminUser(user: UserProfile | null): Promise<boolean> {
  const email = (user?.email || '').trim().toLowerCase();
  if (!email) return false;
  const allow = await getAdminEmails();
  return allow.includes(email);
}

export async function assertAdminUser(user: UserProfile | null): Promise<void> {
  const ok = await isAdminUser(user);
  if (!ok) throw new Error('Acesso restrito ao e-mail administrador');
}

export function subscribeAllAppointments(params: {
  dateMs: number;
  status?: AppointmentStatus | 'todos';
  onChange: (items: Appointment[]) => void;
}): Unsubscribe {
  const { dateMs, status, onChange } = params;

  if (!isFirebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const start = dayjs(dateMs).startOf('day').valueOf();
  const end = dayjs(dateMs).endOf('day').valueOf();

  const clauses: any[] = [where('startAt', '>=', start), where('startAt', '<=', end)];
  if (status && status !== 'todos') clauses.push(where('status', '==', status));

  const q = query(collection(db, 'appointments'), ...clauses, orderBy('startAt', 'asc'), limit(300));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }));
      onChange(items);
    },
    (error) => {
      console.error('[Admin] falha ao escutar agendamentos', error);
      onChange([]);
    },
  );
  return unsub;
}

export function subscribeAppointmentsRange(params: {
  startAt: number;
  endAt: number;
  limitCount?: number;
  onChange: (items: Appointment[]) => void;
}): Unsubscribe {
  const { startAt, endAt, limitCount, onChange } = params;

  if (!isFirebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(db, 'appointments'),
    where('startAt', '>=', startAt),
    where('startAt', '<=', endAt),
    orderBy('startAt', 'asc'),
    limit(limitCount || 1200),
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }));
      onChange(items);
    },
    (error) => {
      console.error('[Admin] falha ao escutar agendamentos (intervalo)', error);
      onChange([]);
    },
  );

  return unsub;
}

export function subscribeAllUsers(onChange: (users: UserProfile[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    try {
      const raw = Taro.getStorageSync(localUsersKey) as Array<{ profile: UserProfile }>;
      onChange((raw || []).map((r) => r.profile));
    } catch (error) {
      console.error('[Admin] falha ao ler usuários locais', error);
      onChange([]);
    }
    return () => {};
  }

  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(800));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserProfile, 'id'>) }));
      onChange(items);
    },
    (error) => {
      console.error('[Admin] falha ao escutar usuários', error);
      onChange([]);
    },
  );
  return unsub;
}

export function subscribeAllServices(onChange: (items: ServiceItem[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, 'services'), orderBy('sortOrder', 'asc'), limit(300));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceItem, 'id'>) }));
      onChange(items);
    },
    (error) => {
      console.error('[Admin] falha ao escutar serviços', error);
      onChange([]);
    },
  );
  return unsub;
}

export function subscribeAllPromotions(onChange: (items: Promotion[]) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onChange([]);
    return () => {};
  }
  const db = getFirebaseDb();
  if (!db) {
    onChange([]);
    return () => {};
  }

  const q = query(collection(db, 'promotions'), orderBy('updatedAt', 'desc'), limit(200));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Promotion, 'id'>) }));
      onChange(items);
    },
    (error) => {
      console.error('[Admin] falha ao escutar promoções', error);
      onChange([]);
    },
  );
  return unsub;
}

export async function upsertService(id: string | null, input: Omit<ServiceItem, 'id'>): Promise<void> {
  const rl = consumeRateLimit({ key: `adminUpsertService`, max: 6, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitas ações seguidas. Aguarde alguns segundos e tente novamente.');
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  const ref = id ? doc(db, 'services', id) : doc(collection(db, 'services'));
  const now = Date.now();
  const payload: any = { ...input, updatedAt: now };
  if (!id) payload.createdAt = now;
  await setDoc(ref, payload, { merge: true });
}

export async function deleteService(id: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  await updateDoc(doc(db, 'services', id), { active: false });
}

export async function upsertPromotion(id: string | null, input: Omit<Promotion, 'id'> & { updatedAt?: number }): Promise<void> {
  const rl = consumeRateLimit({ key: `adminUpsertPromotion`, max: 6, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitas ações seguidas. Aguarde alguns segundos e tente novamente.');
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  const ref = id ? doc(db, 'promotions', id) : doc(collection(db, 'promotions'));
  await setDoc(ref, { ...input, updatedAt: Date.now() }, { merge: true });
}

export async function setUserAdminFields(userId: string, input: Partial<Pick<UserProfile, 'vip' | 'blocked' | 'adminNotes'>>): Promise<void> {
  const rl = consumeRateLimit({ key: `adminUpdateClient`, max: 8, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitas ações seguidas. Aguarde alguns segundos e tente novamente.');
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  await updateDoc(doc(db, 'users', userId), input as any);
}
