export type AuthProvider = 'password' | 'google';

export interface UserProfile {
  id: string;
  fullName: string;
  socialName?: string;
  phoneE164: string;
  email?: string;
  provider: AuthProvider;
  createdAt: number;
  vip?: boolean;
  blocked?: boolean;
  adminNotes?: string;
}

export interface RegisterDraft {
  fullName: string;
  socialName?: string;
  phoneRaw: string;
  phoneE164: string;
  password: string;
}

export interface ResetDraft {
  phoneRaw: string;
  phoneE164: string;
}
