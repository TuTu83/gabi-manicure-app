import React, { useEffect, useMemo, useState } from 'react';
import { Button, Image, Input, Picker, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import AppCard from '@/components/AppCard';
import LoadingOverlay from '@/components/LoadingOverlay';
import SectionHeader from '@/components/SectionHeader';
import StarRating from '@/components/StarRating';
import { fetchProfessionals } from '@/services/catalogService';
import { subscribeAllServices } from '@/services/adminService';
import {
  buildSlotsForDay,
  cancelAppointment,
  computeLoyalty,
  createAppointment,
  createWaitlistEntry,
  dateKeyFromMs,
  formatDateLabel,
  formatTime,
  markOnMyWay,
  priceFromCents,
  rescheduleAppointment,
  saveReview,
  subscribeBusyForProfessionalDay,
  subscribeUserAppointments,
} from '@/services/appointmentService';
import { createNotification, maybeSendAppointmentReminder, maybeSendAppointmentStartNotification, requestNotificationPermission } from '@/services/notificationService';
import { startOfDayMs } from '@/services/financeService';
import { useAppStore } from '@/store/appStore';
import type { Appointment, AppointmentStatus, Professional, ServiceItem } from '@/types/booking';
import type { PaymentMethod } from '@/types/finance';
import styles from './index.module.scss';

function BookingPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const settings = useAppStore((s) => s.settings);
  const appName = useAppStore((s) => s.appName);

  const [tab, setTab] = useState<'agendar' | 'meus' | 'historico'>('agendar');
  const [bookingStep, setBookingStep] = useState(1);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [selectedDateMs, setSelectedDateMs] = useState<number>(() => startOfDayMs(Date.now()));
  const [calendarMonthMs, setCalendarMonthMs] = useState<number>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  });
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState<number | null>(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [brokenServiceImages, setBrokenServiceImages] = useState<Record<string, boolean>>({});

  const [busy, setBusy] = useState<Array<{ startAt: number; endAt: number; status: AppointmentStatus }>>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');

  const displayedServices = useMemo(
    () => services.filter((s) => s.active === true && (s.name || '').trim().length > 0 && (s.priceCents ?? 0) > 0),
    [services],
  );
  const visibleServiceIds = useMemo(
    () => new Set(displayedServices.map((s) => s.id)),
    [displayedServices],
  );
  useEffect(() => {
    setSelectedServiceIds((prev) => prev.filter((id) => visibleServiceIds.has(id)));
  }, [visibleServiceIds]);

  const selectedServices = useMemo(() => {
    const set = new Set(selectedServiceIds);
    return displayedServices.filter((s) => set.has(s.id));
  }, [displayedServices, selectedServiceIds]);
  const selectedService = useMemo(() => selectedServices[0] || null, [selectedServices]);
  const selectedProfessional = useMemo(
    () => professionals.find((p) => p.id === selectedProfessionalId) || null,
    [professionals, selectedProfessionalId],
  );
  const totalDurationMinutes = useMemo(
    () => selectedServices.reduce((sum, s) => sum + (s.durationMinutes || 0), 0),
    [selectedServices],
  );
  const firstDayOfCalendarMonth = useMemo(() => {
    const date = new Date(calendarMonthMs);
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  }, [calendarMonthMs]);
  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(firstDayOfCalendarMonth)),
    [firstDayOfCalendarMonth],
  );
  const calendarDays = useMemo(() => {
    const start = new Date(firstDayOfCalendarMonth);
    const dayOfWeek = (start.getDay() + 6) % 7;
    const beginMs = startOfDayMs(start.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    return Array.from({ length: 42 }, (_, idx) => {
      const dateMs = startOfDayMs(beginMs + idx * 24 * 60 * 60 * 1000);
      const date = new Date(dateMs);
      return {
        dateMs,
        day: date.getDate(),
        inMonth: date.getMonth() === start.getMonth(),
        isToday: dateMs === startOfDayMs(Date.now()),
        isPast: dateMs < startOfDayMs(Date.now()),
      };
    });
  }, [firstDayOfCalendarMonth]);
  const totalPriceCents = useMemo(() => selectedServices.reduce((sum, s) => sum + (s.priceCents || 0), 0), [selectedServices]);
  const combinedServiceName = useMemo(() => selectedServices.map((s) => s.name).join(' + '), [selectedServices]);

  const bookingSteps = ['Serviços', 'Data', 'Horários', 'Pagamento', 'Confirmar'];
  const selectedDateLabel = `${formatDateLabel(selectedDateMs)}${selectedSlotStartAt ? ` às ${formatTime(selectedSlotStartAt)}` : ''}`;
  const paymentLabel =
    paymentMethod === 'pix'
      ? 'PIX'
      : paymentMethod === 'dinheiro'
      ? 'Dinheiro'
      : paymentMethod === 'credito'
      ? 'Cartão (Crédito)'
      : paymentMethod === 'debito'
      ? 'Cartão (Débito)'
      : 'Outro';

  const selectService = (serviceId: string) => {
    setSelectedServiceIds((prev) => {
      const has = prev.includes(serviceId);
      const next = has ? prev.filter((id) => id !== serviceId) : [...prev, serviceId];
      return next;
    });
    setSelectedSlotStartAt(null);
  };

  const selectDate = (dateMs: number) => {
    const nextDate = startOfDayMs(dateMs);
    setSelectedDateMs(nextDate);
    setSelectedSlotStartAt(null);
    setCalendarMonthMs(new Date(nextDate).setDate(1));
  };

  const canProceedStep1 = selectedServices.length > 0;
  const canProceedStep2 = Boolean(selectedProfessional && selectedDateMs);
  const canProceedStep3 = Boolean(selectedSlotStartAt);

  const userId = currentUser?.id || '';

  const upcoming = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((a) => a.startAt >= now && a.status !== 'cancelado' && a.status !== 'recusado')
      .sort((a, b) => a.startAt - b.startAt);
  }, [appointments]);

  const history = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((a) => a.startAt < now || a.status === 'cancelado' || a.status === 'recusado' || a.status === 'concluido')
      .sort((a, b) => b.startAt - a.startAt);
  }, [appointments]);

  const loyalty = useMemo(() => computeLoyalty(appointments), [appointments]);

  const slots = useMemo(() => {
    if (!selectedService || !selectedProfessional) return [];
    return buildSlotsForDay({
      dateMs: selectedDateMs,
      durationMinutes: totalDurationMinutes || selectedService.durationMinutes,
      busy,
    });
  }, [busy, selectedDateMs, selectedProfessional, selectedService, totalDurationMinutes]);

  useEffect(() => {
    if (!currentUser) {
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErrorText(null);

    const unsubscribeServices = subscribeAllServices((items) => {
      if (!mounted) return;
      setServices(items);
      setLoading(false);
    });

    const loadProfessionals = async () => {
      try {
        const p = await fetchProfessionals();
        if (!mounted) return;
        setProfessionals(p);
        if (!selectedProfessionalId && p.length) setSelectedProfessionalId(p[0].id);
      } catch (error: any) {
        if (!mounted) return;
        setErrorText(error?.message || 'Não foi possível carregar os profissionais');
      }
    };

    loadProfessionals();

    return () => {
      mounted = false;
      unsubscribeServices();
    };
  }, []);

  useEffect(() => {
    try {
      const loc = (globalThis as any).location as Location | undefined;
      const search = String(loc?.search || '');
      const hash = String(loc?.hash || '');
      const debugEnabled =
        search.includes('debugServices=1') || hash.includes('debugServices=1') || search.includes('firebaseDebug=1') || hash.includes('firebaseDebug=1');
      if (!debugEnabled) return;

      console.log(
        '[BOOKING][RAW SERVICES]',
        services.map((s) => ({
          id: s.id,
          name: s.name,
          active: (s as any).active,
          activeType: typeof (s as any).active,
          priceCents: (s as any).priceCents,
          priceType: typeof (s as any).priceCents,
        })),
      );
      console.log(
        '[BOOKING][FILTERED SERVICES]',
        displayedServices.map((s) => ({
          id: s.id,
          name: s.name,
          active: (s as any).active,
          priceCents: (s as any).priceCents,
        })),
      );
      console.log('[BOOKING][COUNTS]', { raw: services.length, filtered: displayedServices.length });
    } catch {}
  }, [services, displayedServices]);

  useEffect(() => {
    if (!professionals.length) return;
    const exists = professionals.some((p) => p.id === selectedProfessionalId);
    if (!exists) setSelectedProfessionalId(professionals[0].id);
  }, [professionals, selectedProfessionalId]);

  useEffect(() => {
    if (!userId) return;
    return subscribeUserAppointments(userId, setAppointments);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    maybeSendAppointmentReminder(userId, appointments);
    maybeSendAppointmentStartNotification(userId, appointments);
  }, [appointments, userId]);

  useEffect(() => {
    if (process.env.TARO_ENV !== 'h5' || !userId) return;
    const anyWindow = window as any;
    if (anyWindow?.Notification?.permission === 'default') {
      requestNotificationPermission();
    }
  }, [userId]);

  useEffect(() => {
    if (!selectedProfessionalId || !selectedDateMs) return;
    return subscribeBusyForProfessionalDay({
      professionalId: selectedProfessionalId,
      dateMs: selectedDateMs,
      onChange: setBusy,
    });
  }, [selectedDateMs, selectedProfessionalId]);

  const resetBooking = () => {
    setSelectedServiceIds([]);
    setSelectedSlotStartAt(null);
    setBookingNotes('');
    setPaymentMethod('pix');
    setBookingStep(1);
  };

  const handleConfirmBooking = async () => {
    if (!currentUser) return;
    if (currentUser.blocked) {
      setErrorText('Sua conta está bloqueada. Fale com a administradora.');
      return;
    }
    if (!selectedServices.length || !selectedProfessional) return;
    if (!selectedSlotStartAt) {
      setErrorText('Selecione um horário');
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      await requestNotificationPermission();
      const startAt = selectedSlotStartAt;
      const duration = Math.max(0, totalDurationMinutes || 0);
      if (duration <= 0) throw new Error('Selecione ao menos 1 serviço');
      const endAt = startAt + duration * 60 * 1000;
      const serviceNames = selectedServices.map((s) => s.name);
      const appointment = await createAppointment({
        userId: currentUser.id,
        userName: currentUser.socialName || currentUser.fullName,
        phoneE164: currentUser.phoneE164 || '',
        serviceId: selectedServices[0].id,
        serviceName: combinedServiceName || selectedServices[0].name,
        serviceIds: selectedServices.map((s) => s.id),
        serviceNames,
        servicesCount: selectedServices.length,
        durationMinutes: duration,
        totalDurationMinutes: duration,
        priceCents: totalPriceCents,
        totalPriceCents,
        paymentMethod,
        professionalId: selectedProfessional.id,
        professionalName: selectedProfessional.name,
        startAt,
        endAt,
        notes: bookingNotes.trim() || null,
      });

      await createNotification({
        target: 'admin',
        type: 'confirmacao_agendamento',
        title: 'Novo agendamento',
        body: `${appointment.userName} solicitou:\n${appointment.serviceName}\nTotal ${priceFromCents(
          appointment.priceCents || 0,
        )}\nPagamento: ${paymentMethod.toUpperCase()}\n${formatDateLabel(appointment.startAt)} às ${formatTime(appointment.startAt)}`,
        appointmentId: appointment.id,
      });

      Taro.showToast({ title: 'Agendamento criado', icon: 'success' });
      resetBooking();
      setTab('meus');
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível agendar');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (item: Appointment) => {
    setSelectedAppointment(item);
    setDetailOpen(true);
  };

  const handleCancel = async () => {
    if (!selectedAppointment || !currentUser) return;
    setLoading(true);
    setErrorText(null);
    try {
      await cancelAppointment(selectedAppointment.id);
      await Promise.all([
        createNotification({
          target: 'admin',
          type: 'cancelamento_agendamento',
          title: 'Agendamento cancelado',
          body: `${selectedAppointment.userName} cancelou:\n${selectedAppointment.serviceName}\n${formatDateLabel(
            selectedAppointment.startAt,
          )} às ${formatTime(selectedAppointment.startAt)}`,
          appointmentId: selectedAppointment.id,
        }),
        createNotification({
          target: 'cliente',
          targetUserId: currentUser.id,
          type: 'cancelamento_agendamento',
          title: 'Agendamento cancelado',
          body: `Seu agendamento de ${selectedAppointment.serviceName} foi cancelado.`,
          appointmentId: selectedAppointment.id,
        }),
      ]);
      Taro.showToast({ title: 'Cancelado', icon: 'success' });
      setDetailOpen(false);
      setSelectedAppointment(null);
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível cancelar');
    } finally {
      setLoading(false);
    }
  };

  const handleOnMyWay = async () => {
    if (!selectedAppointment || !currentUser) return;
    setLoading(true);
    setErrorText(null);
    try {
      await markOnMyWay(selectedAppointment.id);
      await createNotification({
        target: 'admin',
        type: 'cliente_a_caminho',
        title: 'Cliente a caminho',
        body: `${selectedAppointment.userName} está a caminho\n${selectedAppointment.serviceName}\n${formatDateLabel(selectedAppointment.startAt)} às ${formatTime(selectedAppointment.startAt)}`,
        appointmentId: selectedAppointment.id,
      });
      Taro.showToast({ title: 'Aviso enviado', icon: 'success' });
      setDetailOpen(false);
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível enviar o aviso');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReschedule = () => {
    if (!selectedAppointment) return;
    setSelectedServiceIds(selectedAppointment.serviceIds?.length ? selectedAppointment.serviceIds : [selectedAppointment.serviceId]);
    setSelectedProfessionalId(selectedAppointment.professionalId);
    setSelectedDateMs(selectedAppointment.startAt);
    setSelectedSlotStartAt(null);
    setRescheduleOpen(true);
  };

  const handleConfirmReschedule = async () => {
    if (!selectedAppointment || !selectedProfessional) return;
    if (!selectedSlotStartAt) {
      setErrorText('Selecione um horário');
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const startAt = selectedSlotStartAt;
      const endAt = startAt + selectedAppointment.durationMinutes * 60 * 1000;
      await rescheduleAppointment({
        appointmentId: selectedAppointment.id,
        professionalId: selectedProfessional.id,
        professionalName: selectedProfessional.name,
        startAt,
        endAt,
      });
      await Promise.all([
        createNotification({
          target: 'admin',
          type: 'alteracao_agendamento',
          title: 'Reagendamento solicitado',
          body: `${selectedAppointment.userName} solicitou reagendar:\n${selectedAppointment.serviceName}\npara ${formatDateLabel(startAt)} às ${formatTime(startAt)}`,
          appointmentId: selectedAppointment.id,
        }),
        createNotification({
          target: 'cliente',
          targetUserId: currentUser?.id,
          type: 'alteracao_agendamento',
          title: 'Reagendamento solicitado',
          body: `Seu reagendamento foi solicitado para ${formatDateLabel(startAt)} às ${formatTime(startAt)}.`,
          appointmentId: selectedAppointment.id,
        }),
      ]);
      Taro.showToast({ title: 'Reagendamento enviado', icon: 'success' });
      setRescheduleOpen(false);
      setDetailOpen(false);
      setSelectedAppointment(null);
      resetBooking();
      setTab('meus');
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível reagendar');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReview = () => {
    if (!selectedAppointment) return;
    setReviewRating(0);
    setReviewComment('');
    setReviewOpen(true);
  };

  const handleSaveReview = async () => {
    if (!selectedAppointment || !currentUser) return;
    setLoading(true);
    setErrorText(null);
    try {
      await saveReview({
        appointmentId: selectedAppointment.id,
        userId: currentUser.id,
        professionalId: selectedAppointment.professionalId,
        serviceId: selectedAppointment.serviceId,
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      });
      Taro.showToast({ title: 'Avaliação enviada', icon: 'success' });
      setReviewOpen(false);
      setDetailOpen(false);
      setSelectedAppointment(null);
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível enviar avaliação');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWaitlist = async () => {
    if (!currentUser || !selectedService || !selectedProfessional) return;
    setLoading(true);
    setErrorText(null);
    try {
      const dateKey = dateKeyFromMs(selectedDateMs);
      await createWaitlistEntry({
        userId: currentUser.id,
        userName: currentUser.socialName || currentUser.fullName,
        phoneE164: currentUser.phoneE164 || '',
        serviceId: selectedService.id,
        professionalId: selectedProfessional.id,
        dateKey,
      });
      Taro.showToast({ title: 'Entrou na lista de espera', icon: 'success' });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível entrar na lista de espera');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className={styles.container}>
      <LoadingOverlay visible={loading} title="Aguarde…" description="Estamos atualizando sua agenda." />

      <View className={styles.header}>
        <View className={styles.brandRow}>
          {settings.logoUrl ? <Image className={styles.brandLogo} src={settings.logoUrl} mode="aspectFit" /> : <View className={styles.brandLogoFallback} />}
          <Text className={styles.brandName}>{appName}</Text>
        </View>
        <Text className={styles.title}>Agendamentos</Text>
        <Text className={styles.desc}>Escolha um ou mais serviços, selecione o horário e confirme com segurança.</Text>

        <View className={styles.tabs}>
          <Button className={classnames(styles.tabBtn, tab === 'agendar' && styles.tabBtnActive)} onClick={() => setTab('agendar')}>
            <Text className={styles.tabText}>Agendar</Text>
          </Button>
          <Button className={classnames(styles.tabBtn, tab === 'meus' && styles.tabBtnActive)} onClick={() => setTab('meus')}>
            <Text className={styles.tabText}>Meus horários</Text>
          </Button>
          <Button
            className={classnames(styles.tabBtn, tab === 'historico' && styles.tabBtnActive)}
            onClick={() => setTab('historico')}
          >
            <Text className={styles.tabText}>Histórico</Text>
          </Button>
        </View>
      </View>

      <View className={styles.content}>
        {errorText ? (
          <View className={styles.pickCard}>
            <Text className={styles.desc} style={{ color: 'var(--color-error)' }}>
              {errorText}
            </Text>
          </View>
        ) : null}

        {tab === 'agendar' ? (
          <>
            <View className={styles.stepHeader}>
              {bookingSteps.map((stepLabel, index) => {
                const stepNum = index + 1;
                return (
                  <View key={stepLabel} className={classnames(styles.stepItem, bookingStep === stepNum && styles.stepItemActive)}>
                    <Text className={styles.stepNumber}>{stepNum}</Text>
                    <Text className={styles.stepTitle}>{stepLabel}</Text>
                  </View>
                );
              })}
            </View>

            <View className={styles.stepBody}>
              {bookingStep === 1 ? (
                <>
                  <Text className={styles.sectionTitle}>Selecione os serviços</Text>
                  <Text className={styles.sectionSubtitle}>Escolha um ou mais serviços criados pela administração.</Text>

                  {displayedServices.length ? (
                    <View className={styles.grid}>
                      {displayedServices.map((s) => {
                        const active = selectedServiceIds.includes(s.id);
                        const imageKey = `${s.id}_${s.imageUrl || ''}`;
                        const showImage = Boolean(s.imageUrl) && !brokenServiceImages[imageKey];
                        return (
                          <View
                            key={s.id}
                            className={classnames(styles.serviceCard, active && styles.serviceCardActive)}
                            onClick={() => selectService(s.id)}
                          >
                            {showImage ? (
                              <Image
                                className={styles.serviceImage}
                                src={s.imageUrl}
                                mode="aspectFill"
                                onError={() => setBrokenServiceImages((prev) => ({ ...prev, [imageKey]: true }))}
                              />
                            ) : (
                              <View className={styles.serviceImageFallback} />
                            )}
                            <View className={styles.serviceCardBody}>
                              <View className={styles.serviceCardHeader}>
                                <Text className={styles.serviceName}>{s.name}</Text>
                                <Text className={styles.servicePrice}>{priceFromCents(s.priceCents)}</Text>
                              </View>
                              <Text className={styles.serviceDesc}>{s.description}</Text>
                              <View className={styles.serviceFooter}>
                                <Text className={classnames(styles.badge, active ? styles.badgePrimary : styles.badge)}>
                                  {active ? 'Selecionado' : 'Tocar para selecionar'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <AppCard>
                      <Text className={styles.desc}>Nenhum serviço disponível no momento. A administração precisa cadastrar serviços no painel.</Text>
                    </AppCard>
                  )}

                  <View className={styles.summaryCard}>
                    <Text className={styles.summaryLabel}>Valor total</Text>
                    <Text className={styles.summaryValue}>{priceFromCents(totalPriceCents)}</Text>
                  </View>

                  <View className={styles.footerActions}>
                    <Button className={classnames(styles.primaryBtn, !canProceedStep1 && styles.primaryBtnDisabled)} disabled={!canProceedStep1} onClick={() => setBookingStep(2)}>
                      <Text className={styles.primaryBtnText}>Continuar para data</Text>
                    </Button>
                  </View>
                </>
              ) : null}

              {bookingStep === 2 ? (
                <>
                  <Text className={styles.sectionTitle}>Escolha a data</Text>
                  <Text className={styles.sectionSubtitle}>Selecione uma data ideal para o atendimento.</Text>

                  <AppCard>
                    <View className={styles.quickRow}>
                      <Button className={styles.quickBtn} onClick={() => selectDate(Date.now())}>
                        <Text className={styles.quickBtnText}>Hoje</Text>
                      </Button>
                      <Button className={styles.quickBtn} onClick={() => selectDate(Date.now() + 7 * 24 * 60 * 60 * 1000)}>
                        <Text className={styles.quickBtnText}>Próxima semana</Text>
                      </Button>
                      <Button className={styles.quickBtn} onClick={() => selectDate(Date.now() + 14 * 24 * 60 * 60 * 1000)}>
                        <Text className={styles.quickBtnText}>2 semanas</Text>
                      </Button>
                    </View>

                    <View className={styles.calendarWrapper}>
                      <View className={styles.calendarHeader}>
                        <Button className={styles.calendarNavBtn} onClick={() => setCalendarMonthMs(new Date(new Date(calendarMonthMs).getFullYear(), new Date(calendarMonthMs).getMonth() - 1, 1).getTime())}>
                          <Text className={styles.calendarNavText}>‹</Text>
                        </Button>
                        <Text className={styles.calendarMonthLabel}>{monthTitle}</Text>
                        <Button className={styles.calendarNavBtn} onClick={() => setCalendarMonthMs(new Date(new Date(calendarMonthMs).getFullYear(), new Date(calendarMonthMs).getMonth() + 1, 1).getTime())}>
                          <Text className={styles.calendarNavText}>›</Text>
                        </Button>
                      </View>

                      <View className={styles.calendarWeekdays}>
                        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
                          <Text key={day} className={styles.calendarWeekday}>
                            {day}
                          </Text>
                        ))}
                      </View>

                      <View className={styles.calendarGrid}>
                        {calendarDays.map((day) => (
                          <Button
                            key={day.dateMs}
                            className={classnames(
                              styles.calendarDay,
                              !day.inMonth && styles.calendarDayFaded,
                              day.isPast && styles.calendarDayDisabled,
                              selectedDateMs === day.dateMs && styles.calendarDaySelected,
                            )}
                            disabled={day.isPast}
                            onClick={() => selectDate(day.dateMs)}
                          >
                            <Text className={styles.calendarDayText}>{day.day}</Text>
                          </Button>
                        ))}
                      </View>
                    </View>

                    <View className={styles.pickRow}>
                      <Text className={styles.pickLabel}>Profissional</Text>
                      <Picker
                        mode="selector"
                        range={professionals.map((p) => p.name)}
                        onChange={(e) => {
                          const idx = Number(e.detail.value);
                          const p = professionals[idx];
                          if (!p) return;
                          setSelectedProfessionalId(p.id);
                          setSelectedSlotStartAt(null);
                        }}
                      >
                        <Text className={styles.pickValue}>{selectedProfessional?.name || 'Selecionar profissional'}</Text>
                      </Picker>
                    </View>
                  </AppCard>

                  <View className={styles.footerActions}>
                    <Button className={styles.secondaryBtn} onClick={() => setBookingStep(1)}>
                      <Text className={styles.secondaryBtnText}>Voltar</Text>
                    </Button>
                    <Button className={classnames(styles.primaryBtn, !canProceedStep2 && styles.primaryBtnDisabled)} disabled={!canProceedStep2} onClick={() => setBookingStep(3)}>
                      <Text className={styles.primaryBtnText}>Ir para horários</Text>
                    </Button>
                  </View>
                </>
              ) : null}

              {bookingStep === 3 ? (
                <>
                  <Text className={styles.sectionTitle}>Selecione o horário</Text>
                  <Text className={styles.sectionSubtitle}>Escolha um horário disponível.</Text>

                  <AppCard>
                    {slots.length ? (
                      <View className={styles.grid}>
                        {slots.map((s) => {
                          const active = selectedSlotStartAt === s.startAt;
                          return (
                            <Button
                              key={`${s.startAt}`}
                              className={classnames(styles.slotBtn, s.disabled && styles.slotBtnDisabled, active && styles.slotBtnActive)}
                              disabled={s.disabled}
                              onClick={() => setSelectedSlotStartAt(s.startAt)}
                            >
                              <Text className={styles.slotText}>{formatTime(s.startAt)}</Text>
                            </Button>
                          );
                        })}
                      </View>
                    ) : (
                      <Text className={styles.desc}>Selecione serviços e profissional para ver os horários disponíveis.</Text>
                    )}
                  </AppCard>

                  <View className={styles.footerActions}>
                    <Button className={styles.secondaryBtn} onClick={() => setBookingStep(2)}>
                      <Text className={styles.secondaryBtnText}>Voltar</Text>
                    </Button>
                    <Button className={classnames(styles.primaryBtn, !canProceedStep3 && styles.primaryBtnDisabled)} disabled={!canProceedStep3} onClick={() => setBookingStep(4)}>
                      <Text className={styles.primaryBtnText}>Selecionar pagamento</Text>
                    </Button>
                  </View>
                </>
              ) : null}

              {bookingStep === 4 ? (
                <>
                  <Text className={styles.sectionTitle}>Forma de pagamento</Text>
                  <Text className={styles.sectionSubtitle}>Escolha como você prefere pagar.</Text>

                  <AppCard>
                    <View className={styles.paymentGrid}>
                      {[
                        { key: 'pix', label: 'PIX', subtitle: 'Presencial no dia' },
                        { key: 'dinheiro', label: 'Dinheiro', subtitle: 'Presencial no dia' },
                        { key: 'credito', label: 'Cartão Crédito', subtitle: 'Presencial no dia' },
                        { key: 'debito', label: 'Cartão Débito', subtitle: 'Presencial no dia' },
                      ].map((option) => {
                        const active = paymentMethod === option.key;
                        return (
                          <Button
                            key={option.key}
                            className={classnames(styles.paymentCard, active && styles.paymentCardActive)}
                            onClick={() => setPaymentMethod(option.key as PaymentMethod)}
                          >
                            <Text className={styles.paymentTitle}>{option.label}</Text>
                            <Text className={styles.paymentSubtitle}>{option.subtitle}</Text>
                          </Button>
                        );
                      })}
                    </View>
                  </AppCard>

                  <View className={styles.footerActions}>
                    <Button className={styles.secondaryBtn} onClick={() => setBookingStep(3)}>
                      <Text className={styles.secondaryBtnText}>Voltar</Text>
                    </Button>
                    <Button className={styles.primaryBtn} onClick={() => setBookingStep(5)}>
                      <Text className={styles.primaryBtnText}>Revisar agendamento</Text>
                    </Button>
                  </View>
                </>
              ) : null}

              {bookingStep === 5 ? (
                <>
                  <Text className={styles.sectionTitle}>Resumo do agendamento</Text>
                  <Text className={styles.sectionSubtitle}>Revise antes de confirmar.</Text>

                  <AppCard>
                    <View className={styles.confirmRow}>
                      <Text className={styles.confirmLabel}>Serviços</Text>
                      <Text className={styles.confirmValue}>{combinedServiceName || '-'}</Text>
                    </View>
                    <View className={styles.confirmRow}>
                      <Text className={styles.confirmLabel}>Profissional</Text>
                      <Text className={styles.confirmValue}>{selectedProfessional?.name || '-'}</Text>
                    </View>
                    <View className={styles.confirmRow}>
                      <Text className={styles.confirmLabel}>Data e horário</Text>
                      <Text className={styles.confirmValue}>{selectedDateLabel || '-'}</Text>
                    </View>
                    <View className={styles.confirmRow}>
                      <Text className={styles.confirmLabel}>Pagamento</Text>
                      <Text className={styles.confirmValue}>{paymentLabel}</Text>
                    </View>
                    <View className={styles.confirmRow}>
                      <Text className={styles.confirmLabel}>Valor total</Text>
                      <Text className={styles.confirmValue}>{priceFromCents(totalPriceCents)}</Text>
                    </View>
                    <View className={styles.fieldLabel}>Observações</View>
                    <View className={styles.inputRow}>
                      <Input
                        className={styles.input}
                        value={bookingNotes}
                        onInput={(e) => setBookingNotes(e.detail.value)}
                        placeholder="Ex.: preferência de cor, remoção, etc."
                      />
                    </View>
                  </AppCard>

                  <View className={styles.footerActions}>
                    <Button className={styles.secondaryBtn} onClick={() => setBookingStep(4)}>
                      <Text className={styles.secondaryBtnText}>Voltar</Text>
                    </Button>
                    <Button className={styles.primaryBtn} onClick={handleConfirmBooking}>
                      <Text className={styles.primaryBtnText}>Confirmar agendamento</Text>
                    </Button>
                  </View>
                </>
              ) : null}
            </View>
          </>
        ) : null}

        {tab === 'meus' ? (
          <>
            <SectionHeader title="Próximos agendamentos" />
            {upcoming.length ? (
              upcoming.map((a) => (
                <View key={a.id} className={styles.listItem} onClick={() => openDetail(a)}>
                  <Text className={styles.listTitle}>{a.serviceName}</Text>
                  <Text className={styles.listSub}>
                    {formatDateLabel(a.startAt)} às {formatTime(a.startAt)} • {a.professionalName}
                  </Text>
                  <View className={styles.badgeRow}>
                    <View className={classnames(styles.badge, styles.badgePrimary)}>
                      <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>{a.status}</Text>
                    </View>
                    {a.onMyWayAt ? (
                      <View className={styles.badge}>
                        <Text className={styles.badgeText}>a caminho</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <AppCard>
                <Text className={styles.desc}>Você ainda não tem horários futuros. Agende agora com poucos toques.</Text>
                <Button className={styles.primaryBtn} onClick={() => setTab('agendar')}>
                  <Text className={styles.primaryBtnText}>Agendar agora</Text>
                </Button>
              </AppCard>
            )}

            <SectionHeader title="Fidelidade" />
            <AppCard>
              <Text className={styles.listTitle}>Você tem {loyalty.points} ponto(s)</Text>
              <Text className={styles.listSub}>A cada {loyalty.nextRewardAt} atendimentos concluídos você ganha um mimo.</Text>
            </AppCard>
          </>
        ) : null}

        {tab === 'historico' ? (
          <>
            <SectionHeader title="Histórico de agendamentos" />
            {history.length ? (
              history.map((a) => (
                <View key={a.id} className={styles.listItem} onClick={() => openDetail(a)}>
                  <Text className={styles.listTitle}>{a.serviceName}</Text>
                  <Text className={styles.listSub}>
                    {formatDateLabel(a.startAt)} às {formatTime(a.startAt)} • {a.professionalName}
                  </Text>
                  <View className={styles.badgeRow}>
                    <View className={styles.badge}>
                      <Text className={styles.badgeText}>{a.status}</Text>
                    </View>
                    {a.status === 'concluido' ? (
                      <View className={classnames(styles.badge, styles.badgePrimary)}>
                        <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>avaliável</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <AppCard>
                <Text className={styles.desc}>Nenhum agendamento no histórico por enquanto.</Text>
              </AppCard>
            )}
          </>
        ) : null}
      </View>

      {detailOpen && selectedAppointment ? (
        <View className={styles.modalMask} onClick={() => setDetailOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>{selectedAppointment.serviceName}</Text>
            <Text className={styles.modalDesc}>
              {formatDateLabel(selectedAppointment.startAt)} às {formatTime(selectedAppointment.startAt)} • {selectedAppointment.professionalName}
            </Text>
            <View className={styles.badgeRow}>
              <View className={classnames(styles.badge, styles.badgePrimary)}>
                <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>{selectedAppointment.status}</Text>
              </View>
            </View>

            <Button
              className={styles.primaryBtn}
              onClick={() => {
                setDetailOpen(false);
                setTab('agendar');
                if (selectedAppointment) {
                  setSelectedServiceIds(selectedAppointment.serviceIds?.length ? selectedAppointment.serviceIds : [selectedAppointment.serviceId]);
                  setSelectedProfessionalId(selectedAppointment.professionalId);
                  setSelectedDateMs(selectedAppointment.startAt);
                  setSelectedSlotStartAt(null);
                  if (selectedAppointment.paymentMethod) setPaymentMethod(selectedAppointment.paymentMethod);
                }
              }}
            >
              <Text className={styles.primaryBtnText}>Agendar novamente</Text>
            </Button>

            {selectedAppointment.status !== 'cancelado' && selectedAppointment.status !== 'recusado' && selectedAppointment.startAt > Date.now() ? (
              <>
                <Button className={styles.secondaryBtn} onClick={handleOpenReschedule}>
                  <Text className={styles.secondaryBtnText}>Reagendar</Text>
                </Button>
                <Button className={styles.secondaryBtn} onClick={handleCancel}>
                  <Text className={styles.secondaryBtnText}>Cancelar</Text>
                </Button>
                <Button className={styles.secondaryBtn} onClick={handleOnMyWay}>
                  <Text className={styles.secondaryBtnText}>Estou a caminho</Text>
                </Button>
              </>
            ) : null}

            {selectedAppointment.status === 'concluido' ? (
              <Button className={styles.secondaryBtn} onClick={handleOpenReview}>
                <Text className={styles.secondaryBtnText}>Avaliar</Text>
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}

      {rescheduleOpen ? (
        <View className={styles.modalMask} onClick={() => setRescheduleOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>Reagendar</Text>
            <Text className={styles.modalDesc}>Escolha uma nova data e horário disponíveis.</Text>

            <Text className={styles.fieldLabel}>Data</Text>
            <View className={styles.inputRow}>
              <Picker
                mode="date"
                value={new Date(selectedDateMs).toISOString().slice(0, 10)}
                onChange={(e) => {
                  const value = e.detail.value;
                  const next = new Date(`${value}T00:00:00`).getTime();
                  setSelectedDateMs(startOfDayMs(next));
                  setSelectedSlotStartAt(null);
                }}
              >
                <Text className={styles.pickValue}>{formatDateLabel(selectedDateMs)}</Text>
              </Picker>
            </View>

            <Text className={styles.fieldLabel}>Horário</Text>
            <AppCard contentClassName={styles.grid}>
              {slots.map((s) => {
                const active = selectedSlotStartAt === s.startAt;
                return (
                  <Button
                    key={`rs_${s.startAt}`}
                    className={classnames(styles.slotBtn, s.disabled && styles.slotBtnDisabled, active && styles.slotBtnActive)}
                    disabled={s.disabled}
                    onClick={() => setSelectedSlotStartAt(s.startAt)}
                  >
                    <Text className={styles.slotText}>{formatTime(s.startAt)}</Text>
                  </Button>
                );
              })}
            </AppCard>

            <Button className={styles.primaryBtn} onClick={handleConfirmReschedule}>
              <Text className={styles.primaryBtnText}>Confirmar reagendamento</Text>
            </Button>
            <Button className={styles.secondaryBtn} onClick={() => setRescheduleOpen(false)}>
              <Text className={styles.secondaryBtnText}>Voltar</Text>
            </Button>
          </View>
        </View>
      ) : null}

      {reviewOpen ? (
        <View className={styles.modalMask} onClick={() => setReviewOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>Avaliar atendimento</Text>
            <Text className={styles.modalDesc}>Sua opinião ajuda a manter a experiência premium.</Text>

            <Text className={styles.fieldLabel}>Estrelas</Text>
            <StarRating value={reviewRating} onChange={setReviewRating} />

            <View style={{ height: '24rpx' }} />
            <Text className={styles.fieldLabel}>Comentário (opcional)</Text>
            <View className={styles.inputRow}>
              <Input
                className={styles.input}
                value={reviewComment}
                onInput={(e) => setReviewComment(e.detail.value)}
                placeholder="Conte como foi sua experiência"
              />
            </View>

            <Button className={styles.primaryBtn} onClick={handleSaveReview}>
              <Text className={styles.primaryBtnText}>Enviar avaliação</Text>
            </Button>
            <Button className={styles.secondaryBtn} onClick={() => setReviewOpen(false)}>
              <Text className={styles.secondaryBtnText}>Agora não</Text>
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default BookingPage;
