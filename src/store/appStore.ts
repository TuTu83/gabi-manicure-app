import { create } from 'zustand';
import { safeGetStorage, safeRemoveStorage, safeSetStorage, storageKeys } from '@/services/storage';
import type { RegisterDraft, ResetDraft, UserProfile } from '@/types/user';
import type { OtpChannel, OtpSession } from '@/services/otpService';
import type { AppSettings } from '@/types/settings';
import { getLocalSettings } from '@/services/settingsService';

export type ThemeMode = 'light' | 'dark';

interface PersistedAppState {
  theme: ThemeMode;
  appName: string;
  currentUser: UserProfile | null;
}

interface AppState extends PersistedAppState {
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setAppName: (name: string) => void;
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;

  setCurrentUser: (user: UserProfile | null) => void;
  signOut: () => void;

  registerDraft: RegisterDraft | null;
  resetDraft: ResetDraft | null;
  otpChannel: OtpChannel;
  otpSession: OtpSession | null;
  setRegisterDraft: (draft: RegisterDraft | null) => void;
  setResetDraft: (draft: ResetDraft | null) => void;
  setOtpChannel: (channel: OtpChannel) => void;
  setOtpSession: (session: OtpSession | null) => void;
  resetAuthFlow: () => void;
}

function loadPersisted(): PersistedAppState {
  const data = safeGetStorage<PersistedAppState>(storageKeys.app);
  return {
    theme: data?.theme ?? 'light',
    appName: data?.appName ?? 'Gabi Manicure',
    currentUser: data?.currentUser ?? null,
  };
}

export const useAppStore = create<AppState>((set, get) => {
  const initial = loadPersisted();
  const initialSettings = getLocalSettings();

  const persist = (next: Partial<PersistedAppState>) => {
    const merged: PersistedAppState = {
      theme: next.theme ?? get().theme,
      appName: next.appName ?? get().appName,
      currentUser: Object.prototype.hasOwnProperty.call(next, 'currentUser') ? (next.currentUser ?? null) : get().currentUser,
    };
    safeSetStorage(storageKeys.app, merged);
  };

  return {
    ...initial,
    settings: initialSettings,

    setTheme: (theme) => {
      set({ theme });
      persist({ theme });
    },
    toggleTheme: () => {
      const next: ThemeMode = get().theme === 'light' ? 'dark' : 'light';
      set({ theme: next });
      persist({ theme: next });
    },
    setAppName: (name) => {
      const value = (name || '').trim() || 'Gabi Manicure';
      set({ appName: value });
      persist({ appName: value });
    },
    setSettings: (settings) => {
      set({ settings });
      if (settings?.appName) {
        const value = (settings.appName || '').trim() || 'Gabi Manicure';
        set({ appName: value });
        persist({ appName: value });
      }
    },

    setCurrentUser: (user) => {
      set({ currentUser: user });
      persist({ currentUser: user });
    },
    signOut: () => {
      set({ currentUser: null });
      persist({ currentUser: null });
      set({
        registerDraft: null,
        resetDraft: null,
        otpChannel: 'sms',
        otpSession: null,
      });
    },

    registerDraft: null,
    resetDraft: null,
    otpChannel: 'sms',
    otpSession: null,
    setRegisterDraft: (draft) => set({ registerDraft: draft }),
    setResetDraft: (draft) => set({ resetDraft: draft }),
    setOtpChannel: (channel) => set({ otpChannel: channel }),
    setOtpSession: (session) => set({ otpSession: session }),
    resetAuthFlow: () => set({ registerDraft: null, resetDraft: null, otpSession: null, otpChannel: 'sms' }),
  };
});

export function clearAppStorage(): void {
  safeRemoveStorage(storageKeys.app);
}
