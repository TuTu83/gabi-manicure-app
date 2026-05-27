import React, { useEffect, useMemo, useState } from 'react';
import { Button, Image, Input, Picker, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import AppCard from '@/components/AppCard';
import LoadingOverlay from '@/components/LoadingOverlay';
import SectionHeader from '@/components/SectionHeader';
import StarRating from '@/components/StarRating';
import { fetchProfessionals, fetchServices } from '@/services/catalogService';
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
import { createNotification, maybeSendAppointmentReminder, requestNotificationPermission } from '@/services/notificationService';
import { useAppStore } from '@/store/appStore';
import type { Appointment, AppointmentStatus, Professional, ServiceItem } from '@/types/booking';
import styles from './index.module.scss';

function BookingPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const settings = useAppStore((s) => s.settings);
  const appName = useAppStore((s) => s.appName);

  const [tab, setTab] = useState<'agendar' | 'meus' | 'historico'>('agendar');
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [selectedDateMs, setSelectedDateMs] = useState<number>(() => Date.now());
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState<number | null>(null);
  const [bookingNotes, setBookingNotes] = useState('');

  const [busy, setBusy] = useState<Array<{ startAt: number; endAt: number; status: AppointmentStatus }>>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) || null,
    [services, selectedServiceId],
  );
  const selectedProfessional = useMemo(
    () => professionals.find((p) => p.id === selectedProfessionalId) || null,
    [professionals, selectedProfessionalId],
  );

  const userId = currentUser?.id || '';

  const upcoming = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((a) => a.startAt >= now && a.status !== 'cancelado')
      .sort((a, b) => a.startAt - b.startAt);
  }, [appointments]);

  const history = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((a) => a.startAt < now || a.status === 'cancelado' || a.status === 'concluido')
      .sort((a, b) => b.startAt - a.startAt);
  }, [appointments]);

  const loyalty = useMemo(() => computeLoyalty(appointments), [appointments]);

  const slots = useMemo(() => {
    if (!selectedService || !selectedProfessional) return [];
    return buildSlotsForDay({
      dateMs: selectedDateMs,
      durationMinutes: selectedService.durationMinutes,
      busy,
    });
  }, [busy, selectedDateMs, selectedProfessional, selectedService]);

  useEffect(() => {
    if (!currentUser) {
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setErrorText(null);
      try {
        const [s, p] = await Promise.all([fetchServices(), fetchProfessionals()]);
        if (!mounted) return;
        setServices(s);
        setProfessionals(p);
        if (!selectedServiceId && s.length) setSelectedServiceId(s[0].id);
        if (!selectedProfessionalId && p.length) setSelectedProfessionalId(p[0].id);
      } catch (error: any) {
        setErrorText(error?.message || 'Não foi possível carregar o catálogo');
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    return subscribeUserAppointments(userId, setAppointments);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    maybeSendAppointmentReminder(userId, appointments);
  }, [appointments, userId]);

  useEffect(() => {
    if (!selectedProfessionalId || !selectedDateMs) return;
    return subscribeBusyForProfessionalDay({
      professionalId: selectedProfessionalId,
      dateMs: selectedDateMs,
      onChange: setBusy,
    });
  }, [selectedDateMs, selectedProfessionalId]);

  const resetBooking = () => {
    setSelectedSlotStartAt(null);
    setBookingNotes('');
  };

  const handleConfirmBooking = async () => {
    if (!currentUser) return;
    if (currentUser.blocked) {
      setErrorText('Sua conta está bloqueada. Fale com a administradora.');
      return;
    }
    if (!selectedService || !selectedProfessional) return;
    if (!selectedSlotStartAt) {
      setErrorText('Selecione um horário');
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      await requestNotificationPermission();
      const startAt = selectedSlotStartAt;
      const endAt = startAt + selectedService.durationMinutes * 60 * 1000;
      const appointment = await createAppointment({
        userId: currentUser.id,
        userName: currentUser.socialName || currentUser.fullName,
        phoneE164: currentUser.phoneE164,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        durationMinutes: selectedService.durationMinutes,
        priceCents: selectedService.priceCents,
        professionalId: selectedProfessional.id,
        professionalName: selectedProfessional.name,
        startAt,
        endAt,
        notes: bookingNotes.trim() || undefined,
      });

      await Promise.all([
        createNotification({
          target: 'admin',
          type: 'confirmacao_agendamento',
          title: 'Novo agendamento',
          body: `${appointment.userName} solicitou ${appointment.serviceName} em ${formatDateLabel(appointment.startAt)} às ${formatTime(
            appointment.startAt,
          )}.`,
          appointmentId: appointment.id,
        }),
        createNotification({
          target: 'cliente',
          targetUserId: currentUser.id,
          type: 'confirmacao_agendamento',
          title: 'Agendamento solicitado',
          body: `Recebemos seu pedido para ${appointment.serviceName} em ${formatDateLabel(appointment.startAt)} às ${formatTime(
            appointment.startAt,
          )}.`,
          appointmentId: appointment.id,
        }),
      ]);

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
          body: `${selectedAppointment.userName} cancelou ${selectedAppointment.serviceName} em ${formatDateLabel(
            selectedAppointment.startAt,
          )} às ${formatTime(selectedAppointment.startAt)}.`,
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
        body: `${selectedAppointment.userName} informou que está a caminho.`,
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
    setSelectedServiceId(selectedAppointment.serviceId);
    setSelectedProfessionalId(selectedAppointment.professionalId);
    setSelectedDateMs(selectedAppointment.startAt);
    setSelectedSlotStartAt(null);
    setRescheduleOpen(true);
  };

  const handleConfirmReschedule = async () => {
    if (!selectedAppointment || !selectedService || !selectedProfessional) return;
    if (!selectedSlotStartAt) {
      setErrorText('Selecione um horário');
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const startAt = selectedSlotStartAt;
      const endAt = startAt + selectedService.durationMinutes * 60 * 1000;
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
          body: `${selectedAppointment.userName} solicitou reagendar para ${formatDateLabel(startAt)} às ${formatTime(startAt)}.`,
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
        phoneE164: currentUser.phoneE164,
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
        <Text className={styles.desc}>Escolha um serviço, selecione o horário e confirme com segurança.</Text>

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
            <SectionHeader title="1) Serviço" />
            <View className={styles.grid}>
              {services.map((s) => {
                const active = s.id === selectedServiceId;
                return (
                  <View
                    key={s.id}
                    className={classnames(styles.serviceItem, active && styles.serviceItemActive)}
                    onClick={() => {
                      setSelectedServiceId(s.id);
                      if (s.defaultProfessionalId && professionals.some((p) => p.id === s.defaultProfessionalId)) {
                        setSelectedProfessionalId(s.defaultProfessionalId);
                      }
                      setSelectedSlotStartAt(null);
                    }}
                  >
                    {s.imageUrl ? (
                      <Image className={styles.serviceImage} src={s.imageUrl} mode="aspectFill" />
                    ) : (
                      <View className={styles.serviceImageFallback} />
                    )}
                    <Text className={styles.serviceName}>{s.name}</Text>
                    <Text className={styles.serviceDesc}>{s.description}</Text>
                    <View className={styles.metaRow}>
                      <Text className={styles.metaText}>{s.durationMinutes} min</Text>
                      <Text className={styles.metaText}>{priceFromCents(s.priceCents)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <SectionHeader title="2) Profissional e data" />
            <AppCard>
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
                  <Text className={styles.pickValue}>{selectedProfessional?.name || 'Selecionar'}</Text>
                </Picker>
              </View>
              <View style={{ height: '20rpx' }} />
              <View className={styles.pickRow}>
                <Text className={styles.pickLabel}>Data</Text>
                <Picker
                  mode="date"
                  value={new Date(selectedDateMs).toISOString().slice(0, 10)}
                  onChange={(e) => {
                    const value = e.detail.value;
                    const next = new Date(`${value}T00:00:00`).getTime();
                    setSelectedDateMs(next);
                    setSelectedSlotStartAt(null);
                  }}
                >
                  <Text className={styles.pickValue}>{formatDateLabel(selectedDateMs)}</Text>
                </Picker>
              </View>
            </AppCard>

            <SectionHeader title="3) Horários disponíveis" actionText="Lista de espera" onActionClick={handleJoinWaitlist} />
            <AppCard>
              {slots.length ? (
                <View className={styles.grid}>
                  {slots.map((s) => {
                    const active = selectedSlotStartAt === s.startAt;
                    return (
                      <Button
                        key={`${s.startAt}`}
                        className={classnames(
                          styles.slotBtn,
                          s.disabled && styles.slotBtnDisabled,
                          active && styles.slotBtnActive,
                        )}
                        disabled={s.disabled}
                        onClick={() => setSelectedSlotStartAt(s.startAt)}
                      >
                        <Text className={styles.slotText}>{formatTime(s.startAt)}</Text>
                      </Button>
                    );
                  })}
                </View>
              ) : (
                <Text className={styles.desc}>Selecione serviço e profissional para ver os horários.</Text>
              )}
            </AppCard>

            <SectionHeader title="4) Confirmar" />
            <AppCard>
              <View className={styles.pickRow}>
                <Text className={styles.pickLabel}>Resumo</Text>
                <Text className={styles.pickValue}>
                  {selectedService?.name || '-'} • {selectedProfessional?.name || '-'}
                </Text>
              </View>
              <View style={{ height: '16rpx' }} />
              <View className={styles.pickRow}>
                <Text className={styles.pickLabel}>Quando</Text>
                <Text className={styles.pickValue}>
                  {formatDateLabel(selectedDateMs)}
                  {selectedSlotStartAt ? ` às ${formatTime(selectedSlotStartAt)}` : ''}
                </Text>
              </View>
              <View style={{ height: '16rpx' }} />
              <Text className={styles.fieldLabel}>Observações (opcional)</Text>
              <View className={styles.inputRow}>
                <Input
                  className={styles.input}
                  value={bookingNotes}
                  onInput={(e) => setBookingNotes(e.detail.value)}
                  placeholder="Ex.: preferência de cor, remoção, etc."
                />
              </View>

              <Button className={styles.primaryBtn} onClick={handleConfirmBooking}>
                <Text className={styles.primaryBtnText}>Confirmar agendamento</Text>
              </Button>
              <Button
                className={styles.secondaryBtn}
                onClick={() => {
                  resetBooking();
                  setErrorText(null);
                }}
              >
                <Text className={styles.secondaryBtnText}>Limpar seleção</Text>
              </Button>
            </AppCard>
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
                    <View className={styles.badge}>
                      <Text className={styles.badgeText}>{a.durationMinutes} min</Text>
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
              <View className={styles.badge}>
                <Text className={styles.badgeText}>{selectedAppointment.durationMinutes} min</Text>
              </View>
            </View>

            <Button
              className={styles.primaryBtn}
              onClick={() => {
                setDetailOpen(false);
                setTab('agendar');
                if (selectedAppointment) {
                  setSelectedServiceId(selectedAppointment.serviceId);
                  setSelectedProfessionalId(selectedAppointment.professionalId);
                  setSelectedDateMs(selectedAppointment.startAt);
                  setSelectedSlotStartAt(null);
                }
              }}
            >
              <Text className={styles.primaryBtnText}>Agendar novamente</Text>
            </Button>

            {selectedAppointment.status !== 'cancelado' && selectedAppointment.startAt > Date.now() ? (
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
                  setSelectedDateMs(next);
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
