import React, { useEffect, useMemo, useState } from 'react';
import { Button, Image, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import SectionHeader from '@/components/SectionHeader';
import { fetchPromotions, fetchServices } from '@/services/catalogService';
import { formatDateLabel, formatTime, subscribeUserAppointments } from '@/services/appointmentService';
import { signOut as signOutService } from '@/services/authService';
import { maybeSendAppointmentReminder } from '@/services/notificationService';
import { useAppStore } from '@/store/appStore';
import { getFirstName } from '@/utils/validators';
import type { Appointment, Promotion, ServiceItem } from '@/types/booking';
import styles from './index.module.scss';

function HomePage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const signOut = useAppStore((s) => s.signOut);
  const appName = useAppStore((s) => s.appName);
  const settings = useAppStore((s) => s.settings);
  const allowDarkMode = useAppStore((s) => s.settings.allowDarkMode);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [brokenServiceImages, setBrokenServiceImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!currentUser) {
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  }, [currentUser]);

  const firstName = getFirstName(currentUser?.socialName || currentUser?.fullName || '');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [s, p] = await Promise.all([fetchServices(), fetchPromotions()]);
        if (!mounted) return;
        setServices(s);
        setPromotions(p);
      } catch (error) {
        console.error('[Home] falha ao carregar catálogo', error);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;
    return subscribeUserAppointments(currentUser.id, setAppointments);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    maybeSendAppointmentReminder(currentUser.id, appointments);
  }, [appointments, currentUser?.id]);

  const nextAppointment = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((a) => a.status !== 'cancelado' && a.startAt >= now)
      .sort((a, b) => a.startAt - b.startAt)[0];
  }, [appointments]);

  const handleLogout = async () => {
    try {
      await signOutService();
    } finally {
      signOut();
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View className={styles.brandRow}>
          {settings.logoUrl ? <Image className={styles.brandLogo} src={settings.logoUrl} mode="aspectFit" /> : <View className={styles.brandLogoFallback} />}
          <Text className={styles.brandName}>{appName}</Text>
        </View>
        <Text className={styles.headerTitle}>Olá, {firstName} 👋</Text>
        <Text className={styles.headerSub}>Bem-vinda de volta. Vamos deixar suas unhas impecáveis.</Text>
        <View className={styles.headerActions}>
          {allowDarkMode ? (
            <Button className={styles.headerBtn} onClick={toggleTheme}>
              <Text className={styles.headerBtnText}>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</Text>
            </Button>
          ) : null}
          <Button className={styles.headerBtn} onClick={handleLogout}>
            <Text className={styles.headerBtnText}>Sair</Text>
          </Button>
        </View>
      </View>

      <View className={styles.content}>
        {settings.bannerUrls?.[0] ? (
          <View className={styles.card} style={{ padding: '0', overflow: 'hidden' }}>
            <Image className={styles.bannerImage} src={settings.bannerUrls[0]} mode="aspectFill" />
          </View>
        ) : null}
        <SectionHeader title="Próximos agendamentos" actionText="Agendar" onActionClick={() => Taro.switchTab({ url: '/pages/booking/index' })} />
        <View className={styles.card}>
          <View className={styles.cardTitleRow}>
            <Text className={styles.cardTitle}>Seu próximo horário</Text>
            <Text className={styles.cardDesc}>{nextAppointment ? 'Confirmar detalhes' : 'Em breve'}</Text>
          </View>
          <Text className={styles.cardDesc}>
            {nextAppointment
              ? `${nextAppointment.serviceName} em ${formatDateLabel(nextAppointment.startAt)} às ${formatTime(
                  nextAppointment.startAt,
                )} • ${nextAppointment.professionalName}`
              : 'Assim que você agendar, os detalhes aparecerão aqui.'}
          </Text>
          <Button className={styles.primaryBtn} onClick={() => Taro.switchTab({ url: '/pages/booking/index' })}>
            <Text className={styles.primaryBtnText}>Agendar agora</Text>
          </Button>
        </View>

        <SectionHeader title="Promoções e avisos" />
        <ScrollView className={styles.promoScroll} scrollX>
          {promotions.map((p) => (
            <View key={p.id} className={styles.promoItem}>
              {p.imageUrl ? (
                <Image className={styles.promoImage} src={p.imageUrl} mode="aspectFill" />
              ) : (
                <View className={styles.promoImageFallback} />
              )}
              <Text className={styles.promoTitle}>{p.title}</Text>
              <Text className={styles.promoDesc}>{p.description}</Text>
            </View>
          ))}
        </ScrollView>

        <SectionHeader title="Serviços disponíveis" actionText="Ver todos" onActionClick={() => Taro.switchTab({ url: '/pages/booking/index' })} />
        <View className={styles.serviceGrid}>
          {services.slice(0, 3).map((s) => (
            <View key={s.id} className={styles.serviceItem} onClick={() => Taro.switchTab({ url: '/pages/booking/index' })}>
              {s.imageUrl && !brokenServiceImages[`${s.id}_${s.imageUrl}`] ? (
                <Image
                  className={styles.serviceImage}
                  src={s.imageUrl}
                  mode="aspectFill"
                  onError={() => setBrokenServiceImages((prev) => ({ ...prev, [`${s.id}_${s.imageUrl}`]: true }))}
                />
              ) : (
                <View className={styles.serviceImageFallback} />
              )}
              <Text className={styles.serviceName}>{s.name}</Text>
              <Text className={styles.serviceDesc}>{s.description}</Text>
            </View>
          ))}
        </View>

        <View className={styles.card}>
          <View className={styles.cardTitleRow}>
            <Text className={styles.cardTitle}>Conta</Text>
            <Text className={styles.cardDesc}>Telefone verificado</Text>
          </View>
          <Text className={styles.cardDesc}>
            {currentUser?.phoneE164 ? `Telefone: ${currentUser.phoneE164}` : 'Complete seu telefone para manter sua conta segura.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default HomePage;
