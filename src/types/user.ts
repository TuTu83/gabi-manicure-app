export type AuthProvider = 'password' | 'google';

export interface UserProfile {
  id: string;
  fullName: string;
  socialName?: string;
  phoneE164: string;
  email?: string;
  provider: AuthProvider;
  createdAt: number;
  role: 'admin' | 'client';
  vip?: boolean;
  blocked?: boolean;
  adminNotes?: string;
  fcmToken?: string;
  fcmTokens?: string[];
}

export interface RegisterDraft {
  fullName: string;
  socialName?: string;
  email?: string;
  phoneRaw: string;
  phoneE164: string;
  password: string;
}

export interface ResetDraft {
  phoneRaw: string;
  phoneE164: string;
}
