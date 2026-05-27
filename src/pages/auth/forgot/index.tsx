import React, { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { sendPhoneVerificationCode } from '@/services/authService';
import { useAppStore } from '@/store/appStore';
import { formatPhoneBRDisplay, normalizePhoneBRToE164, validatePhoneBR } from '@/utils/validators';
import styles from './index.module.scss';

function ForgotPasswordPage() {
  const setResetDraft = useAppStore((s) => s.setResetDraft);

  const [phone, setPhone] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setErrorText(null);
    const phoneErr = validatePhoneBR(phone);
    if (phoneErr) return setErrorText(phoneErr);
    const phoneE164 = normalizePhoneBRToE164(phone);
    if (!phoneE164) return setErrorText('Telefone inválido');

    setLoading(true);
    try {
      const verificationId = await sendPhoneVerificationCode({ phoneE164, recaptchaContainerId: 'recaptcha-forgot' });
      setResetDraft({ phoneRaw: phone, phoneE164, verificationId });
      Taro.navigateTo({ url: '/pages/auth/verify/index?mode=reset' });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível enviar o código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <Text className={styles.title}>Recuperar senha</Text>
        <Text className={styles.subtitle}>Confirme seu telefone para criar uma nova senha.</Text>
      </View>

      <View className={styles.card}>
        <View id="recaptcha-forgot" />
        <Text className={styles.fieldLabel}>Telefone com DDD</Text>
        <View className={styles.inputRow}>
          <Input
            className={styles.input}
            value={phone}
            type="text"
            maxlength={20}
            onInput={(e) => setPhone(formatPhoneBRDisplay(e.detail.value))}
            placeholder="Ex.: (11) 999999999"
          />
        </View>

        {errorText ? <Text className={styles.errorText}>{errorText}</Text> : null}

        <Button className={styles.primaryBtn} loading={loading} onClick={handleSend}>
          <Text className={styles.primaryBtnText}>Enviar código</Text>
        </Button>
      </View>
    </View>
  );
}

export default ForgotPasswordPage;
