import React, { useMemo, useState } from 'react';
import { Button, Input, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/appStore';
import { registerWithEmailPassword } from '@/services/authService';
import {
  formatPhoneBRDisplay,
  validateFullName,
  validatePasswordConfirm,
  validatePasswordSecurity,
} from '@/utils/validators';
import styles from './index.module.scss';

function RegisterPage() {
  const setRegisterDraft = useAppStore((s) => s.setRegisterDraft);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);

  const [fullName, setFullName] = useState('');
  const [socialName, setSocialName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validateEmailOptional = (value: string): string | null => {
    const trimmed = (value || '').trim().toLowerCase();
    if (!trimmed) return 'Informe seu e-mail';
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!ok) return 'E-mail inválido';
    return null;
  };

  const passwordHint = useMemo(() => {
    if (!(password || '').trim()) return null;
    const err = validatePasswordSecurity(password);
    return err ? err : 'Senha segura';
  }, [password]);

  const handleContinue = async () => {
    setErrorText(null);
    const fullNameErr = validateFullName(fullName);
    if (fullNameErr) return setErrorText(fullNameErr);
    const emailErr = validateEmailOptional(email);
    if (emailErr) return setErrorText(emailErr);
    const passErr = validatePasswordSecurity(password);
    if (passErr) return setErrorText(passErr);
    const confirmErr = validatePasswordConfirm(password, confirmPassword);
    if (confirmErr) return setErrorText(confirmErr);

    setLoading(true);
    try {
      const profile = await registerWithEmailPassword({
        name: (socialName || '').trim() || fullName.trim(),
        email: email.trim().toLowerCase(),
        phoneRaw: phone || undefined,
        password,
      });
      setRegisterDraft(null);
      setCurrentUser(profile);
      Taro.showToast({ title: 'Conta criada com sucesso', icon: 'success' });
      Taro.switchTab({ url: '/pages/index/index' });
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
        <Text className={styles.subtitle}>Crie sua conta usando e-mail e senha.</Text>
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

        <Text className={styles.fieldLabel}>E-mail</Text>
        <View className={styles.inputRow}>
          <Input className={styles.input} value={email} onInput={(e) => setEmail(e.detail.value)} placeholder="Ex.: nome@gmail.com" />
        </View>

        <Text className={styles.fieldLabel}>Telefone com DDD (opcional)</Text>
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
        {passwordHint ? <Text className={styles.helpText}>{passwordHint}</Text> : null}

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

        {errorText ? <Text className={styles.errorText}>{errorText}</Text> : null}

        <Button className={styles.primaryBtn} loading={loading} onClick={handleContinue}>
          <Text className={styles.primaryBtnText}>Criar conta</Text>
        </Button>

        <Text className={styles.footerLink} onClick={() => Taro.redirectTo({ url: '/pages/auth/login/index' })}>
          Já tenho conta
        </Text>
      </View>
    </View>
  );
}

export default RegisterPage;
