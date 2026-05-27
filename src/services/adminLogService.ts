import Taro from '@tarojs/taro';
import { addDoc, collection } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured, removeUndefinedFields } from '@/services/firebase';
import type { AdminLogRecord } from '@/types/adminLog';
import type { UserProfile } from '@/types/user';

const localKey = 'gm.adminLogs';

function safeGetLocal(): AdminLogRecord[] {
  try {
    const value = Taro.getStorageSync(localKey);
    return (value as AdminLogRecord[]) || [];
  } catch (error) {
    console.error('[Logs] falha ao ler logs locais', error);
    return [];
  }
}

function safeSetLocal(items: AdminLogRecord[]): void {
  try {
    Taro.setStorageSync(localKey, items);
  } catch (error) {
    console.error('[Logs] falha ao salvar logs locais', error);
  }
}

export async function createAdminLog(params: Omit<AdminLogRecord, 'id' | 'createdAt' | 'actorUserId' | 'actorEmail'> & { actor: UserProfile }): Promise<void> {
  const payloadRaw: Omit<AdminLogRecord, 'id'> = {
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    createdAt: Date.now(),
    actorUserId: params.actor.id,
    actorEmail: params.actor.email || undefined,
    summary: params.summary,
    meta: params.meta,
  };
  const payload = removeUndefinedFields(payloadRaw);

  if (!isFirebaseConfigured()) {
    const current = safeGetLocal();
    const next: AdminLogRecord = { id: `local_${Date.now()}`, ...payload };
    safeSetLocal([next, ...current].slice(0, 500));
    return;
  }

  const db = getFirebaseDb();
  if (!db) return;
  try {
    await addDoc(collection(db, 'adminLogs'), payload);
  } catch (error) {
    console.error('[Logs] falha ao salvar log no Firestore', error);
  }
}
