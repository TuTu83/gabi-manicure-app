export function getFirstName(fullName: string): string {
  const normalized = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return normalized.split(' ')[0] || normalized;
}

export function normalizePhoneBRToE164(phoneRaw: string): string | null {
  const digits = (phoneRaw || '').replace(/\D/g, '');
  if (!digits) return null;
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length !== 11) return null;
  return `+55${national}`;
}

export function formatPhoneBRDisplay(phoneRaw: string): string {
  const digits = (phoneRaw || '').replace(/\D/g, '');
  if (!digits) return '';
  let national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  national = national.slice(0, 11);
  if (national.length < 3) return `(${national}`;
  return `(${national.slice(0, 2)}) ${national.slice(2)}`;
}

export function validateFullName(value: string): string | null {
  const name = (value || '').trim().replace(/\s+/g, ' ');
  if (!name) return 'Informe seu nome completo';
  if (name.length < 3) return 'Nome muito curto';
  if (!name.includes(' ')) return 'Digite nome e sobrenome';
  return null;
}

export function validatePhoneBR(value: string): string | null {
  const e164 = normalizePhoneBRToE164(value);
  if (!e164) return 'Informe um celular com DDD (ex.: 11999998888)';
  return null;
}

export function validatePasswordSecurity(value: string): string | null {
  const password = value || '';
  if (!password) return 'Informe uma senha';
  if (password.length < 8) return 'Use no mínimo 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'Inclua ao menos 1 letra maiúscula';
  if (!/[a-z]/.test(password)) return 'Inclua ao menos 1 letra minúscula';
  if (!/\d/.test(password)) return 'Inclua ao menos 1 número';
  return null;
}

export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (!confirm) return 'Confirme sua senha';
  if (password !== confirm) return 'As senhas não conferem';
  return null;
}
