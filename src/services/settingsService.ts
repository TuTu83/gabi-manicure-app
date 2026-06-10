import Taro from '@tarojs/taro';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseDb, isFirebaseConfigured } from '@/services/firebase';
import { consumeRateLimit } from '@/services/storage';
import { AppSettings } from '@/types/settings';

type Unsubscribe = () => void;

const localKey = 'gm.appSettings';

export function getDefaultSettings(): AppSettings {
  return {
    appName: 'Gabi Manicure',
    adminWhatsAppE164: '',
    businessHours: { openHour: 9, closeHour: 19 },
    workingDays: [1, 2, 3, 4, 5, 6],
    notificationsEnabled: true,
    reminderMinutes: 120,
    allowDarkMode: true,
    theme: {},
    updatedAt: Date.now(),
  };
}

export function getLocalSettings(): AppSettings {
  try {
    const value = Taro.getStorageSync(localKey);
    return (value as AppSettings) || getDefaultSettings();
  } catch (error) {
    console.error('[Configuracoes] falha ao ler configurações locais', error);
    return getDefaultSettings();
  }
}

export function setLocalSettings(next: AppSettings): void {
  try {
    Taro.setStorageSync(localKey, next);
  } catch (error) {
    console.error('[Configuracoes] falha ao salvar configurações locais', error);
  }
}

export function subscribeAppSettings(onChange: (settings: AppSettings) => void): Unsubscribe {
  const local = getLocalSettings();
  onChange(local);

  if (!isFirebaseConfigured()) return () => {};
  const db = getFirebaseDb();
  if (!db) return () => {};

  const ref = doc(db, 'appSettings', 'public');
  const unsub = onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? (snap.data() as AppSettings) : null;
      const next = data ? { ...getDefaultSettings(), ...data } : getDefaultSettings();
      setLocalSettings(next);
      onChange(next);
    },
    (error) => {
      console.error('[Configuracoes] falha ao escutar configurações', error);
    },
  );

  return unsub;
}

export async function updateAppSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const rl = consumeRateLimit({ key: 'updateAppSettings', max: 4, windowMs: 15000 });
  if (!rl.allowed) throw new Error('Muitas ações seguidas. Aguarde alguns segundos e tente novamente.');
  const current = getLocalSettings();
  const merged: AppSettings = {
    ...current,
    ...partial,
    businessHours: { ...current.businessHours, ...(partial.businessHours || {}) },
    workingDays: partial.workingDays ?? current.workingDays,
    reminderMinutes: partial.reminderMinutes ?? current.reminderMinutes,
    allowDarkMode: partial.allowDarkMode ?? current.allowDarkMode,
    theme: { ...current.theme, ...(partial.theme || {}) },
    logoUrl: Object.prototype.hasOwnProperty.call(partial, 'logoUrl') ? partial.logoUrl : current.logoUrl,
    bannerUrls: Object.prototype.hasOwnProperty.call(partial, 'bannerUrls') ? partial.bannerUrls : current.bannerUrls,
    updatedAt: Date.now(),
  };
  setLocalSettings(merged);

  if (!isFirebaseConfigured()) return merged;
  const db = getFirebaseDb();
  if (!db) return merged;

  try {
    await setDoc(doc(db, 'appSettings', 'public'), merged, { merge: true });
  } catch (error) {
    console.error('[Configuracoes] falha ao atualizar configurações', error);
  }
  return merged;
}
