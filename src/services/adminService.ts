import Taro from '@tarojs/taro';
import dayjs from 'dayjs';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured, removeUndefinedFields } from '@/services/firebase';
import { consumeRateLimit } from '@/services/storage';
import type { Appointment, AppointmentStatus, Promotion, ServiceItem } from '@/types/booking';
import type { UserProfile } from '@/types/user';

type Unsubscribe = () => void;

export const ADMIN_EMAIL = 'suporte.gabimanicure@gmail.com';
const localUsersKey = 'gm.users';

function isServicesDebugEnabled(): boolean {
  try {
    const loc = (globalThis as any).location as Location | undefined;
    const search = String(loc?.search || '');
    const hash = String(loc?.hash || '');
    return search.includes('debugServices=1') || hash.includes('debugServices=1') || search.includes('firebaseDebug=1') || hash.includes('firebaseDebug=1');
  } catch {
    return false;
  }
}

export async function getAdminEmails(): Promise<string[]> {
  return [ADMIN_EMAIL];
}

export async function isAdminUser(user: UserProfile | null): Promise<boolean> {
  const email = (user?.email || '').trim().toLowerCase();
  if (!email) return false;
  return email === ADMIN_EMAIL;
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

  const q = query(collection(db, 'appointments'), where('startAt', '>=', start), where('startAt', '<=', end), orderBy('startAt', 'asc'), limit(300));
  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }));
      const filtered = status && status !== 'todos' ? items.filter((a) => a.status === status) : items;
      onChange(filtered);
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
      const items = snap.docs.map((d) => {
        const raw = d.data() as Omit<ServiceItem, 'id'>;
        const rawActive: any = (raw as any).active;
        const activeBool = !(rawActive === false || rawActive === 'false' || rawActive === 0 || rawActive === '0');
        const priceCentsNum = Number((raw as any).priceCents ?? 0);
        const sortOrderNum = Number((raw as any).sortOrder ?? 0);
        return {
          id: d.id,
          ...raw,
          active: activeBool,
          priceCents: Number.isFinite(priceCentsNum) ? priceCentsNum : 0,
          sortOrder: Number.isFinite(sortOrderNum) ? sortOrderNum : undefined,
        } as ServiceItem;
      });
      if (isServicesDebugEnabled()) {
        console.log('[SERVICES][RAW SNAPSHOT]', snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        console.log(
          '[SERVICES][NORMALIZED]',
          items.map((s) => ({
            id: s.id,
            name: s.name,
            active: (s as any).active,
            activeType: typeof (s as any).active,
            priceCents: (s as any).priceCents,
            priceType: typeof (s as any).priceCents,
            sortOrder: (s as any).sortOrder,
          })),
        );
      }
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
  const inputActive: any = (input as any).active;
  const activeBool = !(inputActive === false || inputActive === 'false' || inputActive === 0 || inputActive === '0');
  const payload: any = removeUndefinedFields({
    ...input,
    active: activeBool,
    updatedAt: now,
  });
  if (!id) payload.createdAt = now;
  await setDoc(ref, payload, { merge: true });
}

export async function setServiceActive(id: string, active: boolean): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  await updateDoc(doc(db, 'services', id), removeUndefinedFields({ active, updatedAt: Date.now() }) as any);
}

export async function deleteService(id: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Firebase não configurado');
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase indisponível');
  await deleteDoc(doc(db, 'services', id));
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

export async function updateUserFcmToken(userId: string, fcmToken: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = getFirebaseDb();
  if (!db) return;
  try {
    // ArrayUnion para adicionar token sem duplicatas
    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: (await import('firebase/firestore')).arrayUnion(fcmToken),
      updatedAt: Date.now()
    });
    // Mantemos o campo fcmToken para retrocompatibilidade
    await updateDoc(doc(db, 'users', userId), { fcmToken, updatedAt: Date.now() }, { merge: true });
    console.log('[Admin] Token FCM salvo com sucesso para usuário:', userId);
  } catch (error) {
    console.error('[Admin] falha ao salvar token FCM', error);
  }
}

export async function getAdminFcmTokens(): Promise<string[]> {
  if (!isFirebaseConfigured()) {
    console.warn('[Admin] Firebase not configured, no admin tokens');
    return [];
  }
  const db = getFirebaseDb();
  if (!db) {
    console.warn('[Admin] DB not available, no admin tokens');
    return [];
  }
  try {
    const q = query(
      collection(db, 'users'), 
      where('email', '==', ADMIN_EMAIL)
    );
    const snap = await (await import('firebase/firestore')).getDocs(q);
    const tokens: string[] = [];
    snap.forEach(doc => {
      const data = doc.data() as any;
      // Prioriza o array de tokens, mas mantém compatibilidade com campo único
      if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
        data.fcmTokens.forEach((token: string) => {
          if (!tokens.includes(token)) {
            tokens.push(token);
          }
        });
      }
      if (data.fcmToken && !tokens.includes(data.fcmToken)) {
        tokens.push(data.fcmToken);
      }
    });
    console.log('[Admin] Admin FCM tokens found:', tokens.length, tokens.map(t => `${t.substring(0,10)}...`));
    return tokens;
  } catch (error) {
    console.error('[Admin] falha ao obter tokens FCM do admin', error);
    return [];
  }
}
