import React, { useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import { createOtpSession } from '@/services/otpService';
import { useAppStore } from '@/store/appStore';
import { normalizePhoneBRToE164, validatePhoneBR } from '@/utils/validators';
import styles from './index.module.scss';

function ForgotPasswordPage() {
  const otpChannel = useAppStore((s) => s.otpChannel);
  const setOtpChannel = useAppStore((s) => s.setOtpChannel);
  const setOtpSession = useAppStore((s) => s.setOtpSession);
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
      setResetDraft({ phoneRaw: phone, phoneE164 });
      setOtpSession(createOtpSession(phoneE164, otpChannel));
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
        <Text className={styles.fieldLabel}>Telefone com DDD</Text>
        <View className={styles.inputRow}>
          <Input className={styles.input} value={phone} onInput={(e) => setPhone(e.detail.value)} placeholder="Ex.: 11999998888" />
        </View>

        <Text className={styles.fieldLabel}>Receber código via</Text>
        <View className={styles.channelRow}>
          <Button
            className={classnames(styles.channelBtn, otpChannel === 'sms' && styles.channelBtnActive)}
            onClick={() => setOtpChannel('sms')}
          >
            <Text className={styles.channelBtnText}>SMS</Text>
          </Button>
          <Button
            className={classnames(styles.channelBtn, otpChannel === 'whatsapp' && styles.channelBtnActive)}
            onClick={() => setOtpChannel('whatsapp')}
          >
            <Text className={styles.channelBtnText}>WhatsApp</Text>
          </Button>
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
