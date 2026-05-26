import Taro from '@tarojs/taro';
import { getLocalSettings } from '@/services/settingsService';

function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

export async function openAdminWhatsApp(): Promise<void> {
  const phoneE164 = getLocalSettings().adminWhatsAppE164;
  const digits = digitsOnly(phoneE164);
  if (!digits) {
    Taro.showToast({ title: 'WhatsApp não configurado', icon: 'none' });
    return;
  }

  const url = `https://wa.me/${digits}`;
  try {
    if (process.env.TARO_ENV === 'h5') {
      window.open(url, '_blank');
      return;
    }
    await Taro.setClipboardData({ data: phoneE164 });
    Taro.showToast({ title: 'Número copiado. Abra o WhatsApp.', icon: 'none' });
  } catch (error) {
    console.error('[WhatsApp] falha ao abrir', error);
    Taro.showToast({ title: 'Não foi possível abrir o WhatsApp', icon: 'none' });
  }
}
