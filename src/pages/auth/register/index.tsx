import React, { useMemo, useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import { useAppStore } from '@/store/appStore';
import { createOtpSession } from '@/services/otpService';
import {
  normalizePhoneBRToE164,
  validateFullName,
  validatePasswordConfirm,
  validatePasswordSecurity,
  validatePhoneBR,
} from '@/utils/validators';
import styles from './index.module.scss';

function RegisterPage() {
  const setRegisterDraft = useAppStore((s) => s.setRegisterDraft);
  const otpChannel = useAppStore((s) => s.otpChannel);
  const setOtpChannel = useAppStore((s) => s.setOtpChannel);
  const setOtpSession = useAppStore((s) => s.setOtpSession);

  const [fullName, setFullName] = useState('');
  const [socialName, setSocialName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordHint = useMemo(() => {
    const err = validatePasswordSecurity(password);
    return err ? err : 'Senha segura';
  }, [password]);

  const handleContinue = async () => {
    setErrorText(null);
    const fullNameErr = validateFullName(fullName);
    if (fullNameErr) return setErrorText(fullNameErr);
    const phoneErr = validatePhoneBR(phone);
    if (phoneErr) return setErrorText(phoneErr);
    const passErr = validatePasswordSecurity(password);
    if (passErr) return setErrorText(passErr);
    const confirmErr = validatePasswordConfirm(password, confirmPassword);
    if (confirmErr) return setErrorText(confirmErr);

    const phoneE164 = normalizePhoneBRToE164(phone);
    if (!phoneE164) return setErrorText('Telefone inválido');

    setLoading(true);
    try {
      setRegisterDraft({
        fullName: fullName.trim(),
        socialName: socialName.trim() || undefined,
        phoneRaw: phone,
        phoneE164,
        password,
      });
      const session = createOtpSession(phoneE164, otpChannel);
      setOtpSession(session);
      Taro.navigateTo({ url: '/pages/auth/verify/index?mode=register' });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível continuar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <Text className={styles.title}>Criar sua conta</Text>
        <Text className={styles.subtitle}>Confirme seu telefone com um código de 6 dígitos.</Text>
      </View>

      <View className={styles.card}>
        <Text className={styles.fieldLabel}>Nome completo</Text>
        <View className={styles.inputRow}>
          <Input className={styles.input} value={fullName} onInput={(e) => setFullName(e.detail.value)} placeholder="Ex.: Gabriela Silva" />
        </View>

        <Text className={styles.fieldLabel}>Nome social (opcional)</Text>
        <View className={styles.inputRow}>
          <Input className={styles.input} value={socialName} onInput={(e) => setSocialName(e.detail.value)} placeholder="Como prefere ser chamada" />
        </View>

        <Text className={styles.fieldLabel}>Telefone com DDD</Text>
        <View className={styles.inputRow}>
          <Input className={styles.input} value={phone} onInput={(e) => setPhone(e.detail.value)} placeholder="Ex.: 11999998888" />
        </View>

        <Text className={styles.fieldLabel}>Senha</Text>
        <View className={styles.inputRow}>
          <Input
            className={styles.input}
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
            type={showPassword ? 'text' : 'password'}
            placeholder="Crie sua senha"
          />
          <View className={styles.toggle} onClick={() => setShowPassword((v) => !v)}>
            <Text className={styles.toggleText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
          </View>
        </View>
        <Text className={styles.subtitle}>{passwordHint}</Text>

        <Text className={styles.fieldLabel} style={{ marginTop: '24rpx' }}>
          Confirmar senha
        </Text>
        <View className={styles.inputRow}>
          <Input
            className={styles.input}
            value={confirmPassword}
            onInput={(e) => setConfirmPassword(e.detail.value)}
            type={showConfirm ? 'text' : 'password'}
            placeholder="Repita sua senha"
          />
          <View className={styles.toggle} onClick={() => setShowConfirm((v) => !v)}>
            <Text className={styles.toggleText}>{showConfirm ? 'Ocultar' : 'Mostrar'}</Text>
          </View>
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

        <Button className={styles.primaryBtn} loading={loading} onClick={handleContinue}>
          <Text className={styles.primaryBtnText}>Enviar código</Text>
        </Button>

        <Text className={styles.footerLink} onClick={() => Taro.navigateBack()}>
          Já tenho conta
        </Text>
      </View>
    </View>
  );
}

export default RegisterPage;
