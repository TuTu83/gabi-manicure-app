export type OtpChannel = 'sms' | 'whatsapp';

export interface OtpSession {
  phoneE164: string;
  channel: OtpChannel;
  code: string;
  createdAt: number;
  expiresAt: number;
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function createOtpSession(phoneE164: string, channel: OtpChannel): OtpSession {
  const createdAt = Date.now();
  const expiresAt = createdAt + 5 * 60 * 1000;
  return { phoneE164, channel, code: generateCode(), createdAt, expiresAt };
}

export function verifyOtp(session: OtpSession | null, input: string): { ok: boolean; reason?: string } {
  if (!session) return { ok: false, reason: 'Sessão expirada' };
  if (Date.now() > session.expiresAt) return { ok: false, reason: 'Código expirado' };
  const digits = (input || '').replace(/\D/g, '');
  if (digits !== session.code) return { ok: false, reason: 'Código inválido' };
  return { ok: true };
}
