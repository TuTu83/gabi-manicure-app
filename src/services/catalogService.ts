import { collection, getDocs } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import type { Professional, Promotion, ServiceItem } from '@/types/booking';
import { mockProfessionals, mockPromotions, mockServices } from '@/data/catalog';

export async function fetchServices(): Promise<ServiceItem[]> {
  if (!isFirebaseConfigured()) return mockServices;
  const db = getFirebaseDb();
  if (!db) return mockServices;

  try {
    const snap = await getDocs(collection(db, 'services'));
    const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceItem, 'id'>) }));
    const list = data.length ? data : mockServices;
    return list
      .filter((s) => s.active !== false)
      .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  } catch (error) {
    console.error('[Catalogo] falha ao buscar serviços', error);
    return mockServices;
  }
}

export async function fetchProfessionals(): Promise<Professional[]> {
  if (!isFirebaseConfigured()) return mockProfessionals;
  const db = getFirebaseDb();
  if (!db) return mockProfessionals;

  try {
    const snap = await getDocs(collection(db, 'professionals'));
    const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Professional, 'id'>) }));
    return data.length ? data : mockProfessionals;
  } catch (error) {
    console.error('[Catalogo] falha ao buscar profissionais', error);
    return mockProfessionals;
  }
}

export async function fetchPromotions(): Promise<Promotion[]> {
  if (!isFirebaseConfigured()) return mockPromotions;
  const db = getFirebaseDb();
  if (!db) return mockPromotions;

  try {
    const snap = await getDocs(collection(db, 'promotions'));
    const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Promotion, 'id'>) }));
    const list = data.length ? data : mockPromotions;
    const now = Date.now();
    return list.filter((p) => {
      if (p.active === false) return false;
      if (p.startAt && p.startAt > now) return false;
      if (p.endAt && p.endAt < now) return false;
      return true;
    });
  } catch (error) {
    console.error('[Catalogo] falha ao buscar promoções', error);
    return mockPromotions;
  }
}
