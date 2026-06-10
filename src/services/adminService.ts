import Taro from '@tarojs/taro';
import dayjs from 'dayjs';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured, removeUndefinedFields } from '@/services/firebase';
import { consumeRateLimit } from '@/services/storage';
import { Appointment, AppointmentStatus, Promotion, ServiceItem } from '@/types/booking';
import { UserProfile } from '@/types/user';

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
  // Check by role first, then fall back to email check
  if (user?.role === 'admin') return true;
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
  
  // Log before processing
  console.log('[Admin] upsertService - id:', id, 'input:', input);
  
  const payload: any = removeUndefinedFields({
    ...input,
    active: activeBool,
    updatedAt: now,
  });
  
  // Log payload
  console.log('[Admin] upsertService - payload:', payload);
  
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
    // Get user data first to get role
    const userDoc = await getDoc(doc(db, 'users', userId));
    let userRole = 'user';
    if (userDoc.exists()) {
      const data = userDoc.data() as any;
      userRole = data.role || 'user';
    }
    // Token metadata object for future use
    const tokenMetadata = {
      token: fcmToken,
      userId,
      role: userRole,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    // ArrayUnion para adicionar token sem duplicatas (backward compatible)
    await updateDoc(doc(db, 'users', userId), {
      fcmTokens: arrayUnion(fcmToken),
      updatedAt: Date.now()
    });
    // Mantemos o campo fcmToken para retrocompatibilidade
    await setDoc(doc(db, 'users', userId), { 
      fcmToken, 
      updatedAt: Date.now(),
      // Also store tokens with metadata for future use
      fcmTokensWithMetadata: arrayUnion(tokenMetadata)
    }, { merge: true });
    console.log('[Admin] Token FCM salvo com sucesso para usuário:', userId);
  } catch (error) {
    console.error('[Admin] falha ao salvar token FCM', error);
  }
}

export async function removeUserFcmToken(userId: string, fcmToken?: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const db = getFirebaseDb();
  if (!db) return;
  try {
    // First get the current user data to check the fcmToken field
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.exists() ? userDoc.data() : null;
    
    const updateData: any = {
      updatedAt: Date.now()
    };
    
    if (fcmToken) {
      // Remove specific token from array
      updateData.fcmTokens = arrayRemove(fcmToken);
      
      // Also clear the singular fcmToken field if it's the same token
      if (userData?.fcmToken === fcmToken) {
        updateData.fcmToken = null;
      }
    } else {
      // Clear all tokens
      updateData.fcmTokens = [];
      updateData.fcmToken = null;
    }
    
    await updateDoc(doc(db, 'users', userId), updateData);
    console.log('[Admin] Token FCM removido com sucesso para usuário:', userId);
  } catch (error) {
    console.error('[Admin] falha ao remover token FCM', error);
  }
}

export async function getAdminFcmTokens(): Promise<string[]> {
  console.log('[getAdminFcmTokens] INICIO (100% FILTRADO POR ROLE)');
  
  if (!isFirebaseConfigured()) {
    console.warn('[getAdminFcmTokens] Firebase não configurado');
    return [];
  }
  const db = getFirebaseDb();
  if (!db) {
    console.warn('[getAdminFcmTokens] DB não disponível');
    return [];
  }
  
  try {
    const snap = await getDocs(collection(db, 'users'));
    console.log('[getAdminFcmTokens] Total de usuários no Firestore:', snap.size);
    
    const tokensSet = new Set<string>();
    const adminUsersList: any[] = [];
    
    snap.forEach(doc => {
      const data = doc.data() as any;
      const email = (data.email || '').toLowerCase();
      
      // REGRA ABSOLUTA: só role === 'admin' OU email === ADMIN_EMAIL
      const isStrictAdmin = (data.role === 'admin') || (email === ADMIN_EMAIL.toLowerCase());
      
      if (isStrictAdmin) {
        adminUsersList.push({
          id: doc.id,
          email: data.email,
          role: data.role
        });
        
        // Adiciona tokens SEM duplicatas
        if (Array.isArray(data.fcmTokens)) {
          data.fcmTokens.forEach((token: string) => {
            if (token && token.trim().length > 0) {
              tokensSet.add(token.trim());
            }
          });
        }
        
        if (data.fcmToken && data.fcmToken.trim().length > 0) {
          tokensSet.add(data.fcmToken.trim());
        }
      }
    });
    
    const tokens = Array.from(tokensSet);
    console.log('ADMIN TOKENS:');
    console.log('ADMINS ENCONTRADOS:', adminUsersList.length);
    console.log('TOKENS ADMIN (FILTRADOS):', tokens.length);
    tokens.forEach((t, i) => console.log(`- Token ${i+1}: ${t.substring(0, 20)}...`));
    
    return tokens;
  } catch (error) {
    console.error('[getAdminFcmTokens] ERRO:', error);
    return [];
  }
}

export async function getAllClientFcmTokens(): Promise<string[]> {
  console.log('[getAllClientFcmTokens] INICIO (100% FILTRADO POR ROLE)');
  
  if (!isFirebaseConfigured()) {
    console.warn('[getAllClientFcmTokens] Firebase não configurado');
    return [];
  }
  const db = getFirebaseDb();
  if (!db) {
    console.warn('[getAllClientFcmTokens] DB não disponível');
    return [];
  }
  
  try {
    const snap = await getDocs(collection(db, 'users'));
    console.log('[getAllClientFcmTokens] Total de usuários no Firestore:', snap.size);
    
    const tokensSet = new Set<string>();
    const clientUsersList: any[] = [];
    
    snap.forEach(doc => {
      const data = doc.data() as any;
      const email = (data.email || '').toLowerCase();
      
      // REGRA ABSOLUTA: só role === 'client' OU (role === 'user' E email !== ADMIN_EMAIL)
      const isStrictClient = (data.role === 'client') || 
                             ((data.role === 'user' || !data.role) && email !== ADMIN_EMAIL.toLowerCase());
      
      if (isStrictClient) {
        clientUsersList.push({
          id: doc.id,
          email: data.email,
          role: data.role
        });
        
        // Adiciona tokens SEM duplicatas
        if (Array.isArray(data.fcmTokens)) {
          data.fcmTokens.forEach((token: string) => {
            if (token && token.trim().length > 0) {
              tokensSet.add(token.trim());
            }
          });
        }
        
        if (data.fcmToken && data.fcmToken.trim().length > 0) {
          tokensSet.add(data.fcmToken.trim());
        }
      }
    });
    
    const tokens = Array.from(tokensSet);
    console.log('CLIENT TOKENS:');
    console.log('CLIENTES ENCONTRADOS:', clientUsersList.length);
    console.log('TOKENS CLIENTES (FILTRADOS):', tokens.length);
    tokens.forEach((t, i) => console.log(`- Token ${i+1}: ${t.substring(0, 20)}...`));
    
    return tokens;
  } catch (error) {
    console.error('[getAllClientFcmTokens] ERRO:', error);
    return [];
  }
}
