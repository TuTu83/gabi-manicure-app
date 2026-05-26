import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Image, Input, Picker, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import dayjs from 'dayjs';
import AdminAccordion from '@/components/AdminAccordion';
import LoadingOverlay from '@/components/LoadingOverlay';
import MiniBarChart, { type BarChartItem } from '@/components/MiniBarChart';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { subscribeAppointmentsRange, subscribeAllAppointments, subscribeAllPromotions, subscribeAllServices, subscribeAllUsers, setUserAdminFields, upsertPromotion, upsertService } from '@/services/adminService';
import { fetchProfessionals } from '@/services/catalogService';
import { createAdminLog } from '@/services/adminLogService';
import {
  buildSlotsForDay,
  cancelAppointment,
  formatDateLabel,
  formatTime,
  priceFromCents,
  rescheduleAppointment,
  setAppointmentNotes,
  setAppointmentStatus,
} from '@/services/appointmentService';
import { endOfDayMs, fetchPaymentsRangeAll, fetchPaymentsRangeAggregate, fetchPaymentsRangePage, startOfDayMs, subscribePaymentsRange } from '@/services/financeService';
import { createNotification } from '@/services/notificationService';
import { updateAppSettings } from '@/services/settingsService';
import { uploadImageFromPath } from '@/services/uploadService';
import { useAppStore } from '@/store/appStore';
import type { Appointment, AppointmentStatus, Professional, Promotion, ServiceItem } from '@/types/booking';
import type { PaymentMethod, PaymentRecord } from '@/types/finance';
import type { UserProfile } from '@/types/user';
import styles from './index.module.scss';

function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function statusLabel(status: AppointmentStatus, onMyWayAt?: number): string {
  if (onMyWayAt) return 'cliente a caminho';
  if (status === 'concluido') return 'finalizado';
  return status;
}

function AdminPage() {
  const { checking, allowed, currentUser } = useAdminGuard();
  const settings = useAppStore((s) => s.settings);

  const [open, setOpen] = useState({
    dashboard: false,
    appointments: false,
    finance: false,
    services: false,
    promotions: false,
    clients: false,
    settings: false,
  });

  const [professionals, setProfessionals] = useState<Professional[]>([]);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [dayAppointments, setDayAppointments] = useState<Appointment[]>([]);
  const [monthAppointments, setMonthAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const financePageSize = 200;
  const [paymentsLive, setPaymentsLive] = useState<PaymentRecord[]>([]);
  const [financeHistory, setFinanceHistory] = useState<PaymentRecord[]>([]);
  const [financeAfterPaidAt, setFinanceAfterPaidAt] = useState<number | null>(null);
  const [financeHasMore, setFinanceHasMore] = useState(false);
  const [financeLoadingMore, setFinanceLoadingMore] = useState(false);
  const [financeLoadedMore, setFinanceLoadedMore] = useState(false);
  const [financeAggLoading, setFinanceAggLoading] = useState(false);
  const [financeAgg, setFinanceAgg] = useState<{
    totalCents: number;
    count: number;
    topServices: Array<{ label: string; cents: number }>;
    topClients: Array<{ label: string; cents: number }>;
    daySeries: Array<{ dayMs: number; cents: number }>;
    monthSeries: Array<{ monthMs: number; cents: number }>;
  }>({ totalCents: 0, count: 0, topServices: [], topClients: [], daySeries: [], monthSeries: [] });
  const [financeOverview, setFinanceOverview] = useState<{ daily: number; weekly: number; monthly: number; yearly: number }>({
    daily: 0,
    weekly: 0,
    monthly: 0,
    yearly: 0,
  });
  const [financeMonthlyTrend, setFinanceMonthlyTrend] = useState<{
    items: BarChartItem[];
    currentMonthCents: number;
    previousMonthCents: number;
  }>({ items: [], currentMonthCents: 0, previousMonthCents: 0 });
  const financeOverviewLastRunRef = useRef(0);
  const financeAfterCursorRef = useRef<any>(null);
  const [financeInitialLoading, setFinanceInitialLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [filterDateMs, setFilterDateMs] = useState<number>(() => Date.now());
  const [filterStatus, setFilterStatus] = useState<AppointmentStatus | 'todos'>('todos');
  const [searchText, setSearchText] = useState('');
  const [financeStart, setFinanceStart] = useState<string>(() => toISODate(Date.now()));
  const [financeEnd, setFinanceEnd] = useState<string>(() => toISODate(Date.now()));
  const [financeMethod, setFinanceMethod] = useState<PaymentMethod | 'todas'>('todas');

  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentSelected, setAppointmentSelected] = useState<Appointment | null>(null);
  const [appointmentNotes, setAppointmentNotesValue] = useState('');
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDateMs, setRescheduleDateMs] = useState<number>(() => Date.now());
  const [rescheduleSlotStartAt, setRescheduleSlotStartAt] = useState<number | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [exporting, setExporting] = useState(false);

  const [serviceEditorOpen, setServiceEditorOpen] = useState(false);
  const [serviceEditingId, setServiceEditingId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceDesc, setServiceDesc] = useState('');
  const [servicePrice, setServicePrice] = useState('0');
  const [serviceDuration, setServiceDuration] = useState('60');
  const [serviceActive, setServiceActive] = useState(true);
  const [serviceImageUrl, setServiceImageUrl] = useState('');
  const [serviceSort, setServiceSort] = useState('1');

  const [promoEditorOpen, setPromoEditorOpen] = useState(false);
  const [promoEditingId, setPromoEditingId] = useState<string | null>(null);
  const [promoKind, setPromoKind] = useState<'promocao' | 'aviso'>('promocao');
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [promoActive, setPromoActive] = useState(true);
  const [promoImageUrl, setPromoImageUrl] = useState('');
  const [promoStartAt, setPromoStartAt] = useState<string>('');
  const [promoEndAt, setPromoEndAt] = useState<string>('');

  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [clientSelected, setClientSelected] = useState<UserProfile | null>(null);
  const [clientVip, setClientVip] = useState(false);
  const [clientBlocked, setClientBlocked] = useState(false);
  const [clientNotes, setClientNotes] = useState('');

  const [settingsAppName, setSettingsAppName] = useState(settings.appName);
  const [settingsWhatsApp, setSettingsWhatsApp] = useState(settings.adminWhatsAppE164);
  const [settingsOpenHour, setSettingsOpenHour] = useState(String(settings.businessHours.openHour));
  const [settingsCloseHour, setSettingsCloseHour] = useState(String(settings.businessHours.closeHour));
  const [settingsPrimary, setSettingsPrimary] = useState(settings.theme.primary || '');
  const [settingsPrimaryLight, setSettingsPrimaryLight] = useState(settings.theme.primaryLight || '');
  const [settingsPrimaryDark, setSettingsPrimaryDark] = useState(settings.theme.primaryDark || '');
  const [settingsAccent, setSettingsAccent] = useState(settings.theme.accent || '');
  const [settingsNotifications, setSettingsNotifications] = useState(settings.notificationsEnabled);
  const [settingsReminderMinutes, setSettingsReminderMinutes] = useState(String(settings.reminderMinutes || 120));
  const [settingsAllowDarkMode, setSettingsAllowDarkMode] = useState(Boolean(settings.allowDarkMode));
  const [settingsWorkingDays, setSettingsWorkingDays] = useState<number[]>(settings.workingDays || [1, 2, 3, 4, 5, 6]);
  const [settingsLogoUrl, setSettingsLogoUrl] = useState(settings.logoUrl || '');
  const [settingsBannerUrl, setSettingsBannerUrl] = useState((settings.bannerUrls && settings.bannerUrls[0]) || '');

  useEffect(() => {
    setSettingsAppName(settings.appName);
    setSettingsWhatsApp(settings.adminWhatsAppE164);
    setSettingsOpenHour(String(settings.businessHours.openHour));
    setSettingsCloseHour(String(settings.businessHours.closeHour));
    setSettingsPrimary(settings.theme.primary || '');
    setSettingsPrimaryLight(settings.theme.primaryLight || '');
    setSettingsPrimaryDark(settings.theme.primaryDark || '');
    setSettingsAccent(settings.theme.accent || '');
    setSettingsNotifications(settings.notificationsEnabled);
    setSettingsReminderMinutes(String(settings.reminderMinutes || 120));
    setSettingsAllowDarkMode(Boolean(settings.allowDarkMode));
    setSettingsWorkingDays(settings.workingDays || [1, 2, 3, 4, 5, 6]);
    setSettingsLogoUrl(settings.logoUrl || '');
    setSettingsBannerUrl((settings.bannerUrls && settings.bannerUrls[0]) || '');
  }, [settings]);

  useEffect(() => {
    let mounted = true;
    const loadProfessionals = async () => {
      try {
        const list = await fetchProfessionals();
        if (!mounted) return;
        setProfessionals(list);
      } catch (error) {
        console.error('[Admin] falha ao carregar profissionais', error);
      }
    };
    if (allowed) loadProfessionals();
    return () => {
      mounted = false;
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const unsubUsers = subscribeAllUsers(setUsers);
    const unsubServices = subscribeAllServices(setServices);
    const unsubPromos = subscribeAllPromotions(setPromotions);
    return () => {
      unsubUsers();
      unsubServices();
      unsubPromos();
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    return subscribeAppointmentsRange({ startAt: monthStart, endAt: monthEnd, onChange: setMonthAppointments });
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    return subscribeAllAppointments({ dateMs: filterDateMs, status: filterStatus, onChange: setDayAppointments });
  }, [allowed, filterDateMs, filterStatus]);

  useEffect(() => {
    if (!allowed) return;
    const startMs = startOfDayMs(new Date(`${financeStart}T00:00:00`).getTime());
    const endMs = endOfDayMs(new Date(`${financeEnd}T00:00:00`).getTime());
    setFinanceLoadedMore(false);
    setFinanceHasMore(false);
    setFinanceAfterPaidAt(null);
    setFinanceHistory([]);
    setPaymentsLive([]);
    financeAfterCursorRef.current = null;
    return subscribePaymentsRange({
      startAt: startMs,
      endAt: endMs,
      method: financeMethod,
      maxItems: financePageSize,
      onChange: (items) => {
        setPaymentsLive(items);
        setFinanceHistory((prev) => {
          if (!prev.length) return items;
          const byId = new Map<string, PaymentRecord>();
          prev.forEach((p) => byId.set(p.id, p));
          items.forEach((p) => byId.set(p.id, p));
          const merged = Array.from(byId.values()).sort((a, b) => b.paidAt - a.paidAt);
          return merged;
        });
        if (!financeLoadedMore) {
          setFinanceAfterPaidAt(items.length ? items[items.length - 1].paidAt : null);
          setFinanceHasMore(items.length === financePageSize);
        }
      },
    });
  }, [allowed, financeEnd, financeMethod, financeStart]);

  useEffect(() => {
    if (!allowed) return;
    if (!open.finance) return;
    let cancelled = false;
    const run = async () => {
      setFinanceInitialLoading(true);
      try {
        const startMs = startOfDayMs(new Date(`${financeStart}T00:00:00`).getTime());
        const endMs = endOfDayMs(new Date(`${financeEnd}T00:00:00`).getTime());
        const page = await fetchPaymentsRangePage({
          startAt: startMs,
          endAt: endMs,
          method: financeMethod,
          pageSize: financePageSize,
          afterPaidAt: null,
          afterCursor: null,
        });
        if (cancelled) return;
        financeAfterCursorRef.current = page.nextAfterCursor;
        setFinanceAfterPaidAt(page.nextAfterPaidAt);
        setFinanceHasMore(page.items.length === financePageSize && Boolean(page.nextAfterPaidAt));
        setFinanceHistory((prev) => {
          if (!prev.length) return page.items;
          const byId = new Map<string, PaymentRecord>();
          prev.forEach((p) => byId.set(p.id, p));
          page.items.forEach((p) => byId.set(p.id, p));
          return Array.from(byId.values()).sort((a, b) => b.paidAt - a.paidAt);
        });
      } catch (error) {
        console.error('[Admin] falha ao carregar histórico financeiro', error);
      } finally {
        if (!cancelled) setFinanceInitialLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [allowed, financeEnd, financeMethod, financeStart, open.finance]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const run = async () => {
      setFinanceAggLoading(true);
      try {
        const startMs = startOfDayMs(new Date(`${financeStart}T00:00:00`).getTime());
        const endMs = endOfDayMs(new Date(`${financeEnd}T00:00:00`).getTime());
        const agg = await fetchPaymentsRangeAggregate({ startAt: startMs, endAt: endMs, method: financeMethod });
        if (!cancelled) setFinanceAgg(agg);
      } catch (error) {
        console.error('[Admin] falha ao carregar resumo financeiro', error);
        if (!cancelled) setFinanceAgg({ totalCents: 0, count: 0, topServices: [], topClients: [], daySeries: [], monthSeries: [] });
      } finally {
        if (!cancelled) setFinanceAggLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [allowed, financeEnd, financeMethod, financeStart]);

  useEffect(() => {
    if (!allowed) return;
    if (!open.finance) return;
    let cancelled = false;
    const run = async () => {
      try {
        const now = Date.now();
        if (now - financeOverviewLastRunRef.current < 15_000) return;
        financeOverviewLastRunRef.current = now;

        const todayStart = startOfDayMs(Date.now());
        const todayEnd = endOfDayMs(Date.now());
        const weekStart = startOfDayMs(dayjs().subtract(6, 'day').valueOf());
        const weekEnd = todayEnd;
        const monthStart = dayjs().startOf('month').valueOf();
        const monthEnd = dayjs().endOf('month').valueOf();
        const yearStart = dayjs().startOf('year').valueOf();
        const yearEnd = dayjs().endOf('year').valueOf();

        const [dailyAgg, weeklyAgg, monthlyAgg, yearlyAgg] = await Promise.all([
          fetchPaymentsRangeAggregate({ startAt: todayStart, endAt: todayEnd, method: financeMethod }),
          fetchPaymentsRangeAggregate({ startAt: weekStart, endAt: weekEnd, method: financeMethod }),
          fetchPaymentsRangeAggregate({ startAt: monthStart, endAt: monthEnd, method: financeMethod }),
          fetchPaymentsRangeAggregate({ startAt: yearStart, endAt: yearEnd, method: financeMethod }),
        ]);
        if (cancelled) return;
        setFinanceOverview({
          daily: dailyAgg.totalCents,
          weekly: weeklyAgg.totalCents,
          monthly: monthlyAgg.totalCents,
          yearly: yearlyAgg.totalCents,
        });

        const trendStart = dayjs().subtract(5, 'month').startOf('month').valueOf();
        const trendEnd = dayjs().endOf('month').valueOf();
        const trendAgg = await fetchPaymentsRangeAggregate({ startAt: trendStart, endAt: trendEnd, method: financeMethod });
        if (cancelled) return;

        const monthMap = new Map<number, number>(trendAgg.monthSeries.map((m) => [m.monthMs, m.cents]));
        const items: BarChartItem[] = [];
        for (let i = 5; i >= 0; i -= 1) {
          const ms = dayjs().subtract(i, 'month').startOf('month').valueOf();
          const cents = monthMap.get(ms) || 0;
          items.push({ label: dayjs(ms).format('MM/YY'), value: Math.round(cents / 100) });
        }
        const currentMonthMs = dayjs().startOf('month').valueOf();
        const prevMonthMs = dayjs().subtract(1, 'month').startOf('month').valueOf();
        setFinanceMonthlyTrend({
          items,
          currentMonthCents: monthMap.get(currentMonthMs) || 0,
          previousMonthCents: monthMap.get(prevMonthMs) || 0,
        });
      } catch (error) {
        console.error('[Admin] falha ao carregar visão geral do financeiro', error);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [allowed, financeMethod, open.finance]);

  const filteredDayAppointments = useMemo(() => {
    const q = (searchText || '').trim().toLowerCase();
    if (!q) return dayAppointments;
    return dayAppointments.filter((a) => {
      return (
        a.userName.toLowerCase().includes(q) ||
        (a.phoneE164 || '').toLowerCase().includes(q) ||
        (a.serviceName || '').toLowerCase().includes(q) ||
        (a.professionalName || '').toLowerCase().includes(q)
      );
    });
  }, [dayAppointments, searchText]);

  const stats = useMemo(() => {
    const now = Date.now();
    const totalClientes = users.length;
    const vip = users.filter((u) => u.vip).length;

    const agDia = dayAppointments.length;
    const cancDia = dayAppointments.filter((a) => a.status === 'cancelado').length;
    const pendDia = dayAppointments.filter((a) => a.status === 'pendente').length;
    const confDia = dayAppointments.filter((a) => a.status === 'confirmado').length;
    const aCaminhoDia = dayAppointments.filter((a) => Boolean(a.onMyWayAt)).length;

    const faturamentoDia = dayAppointments
      .filter((a) => a.status === 'confirmado' || a.status === 'concluido')
      .reduce((sum, a) => sum + (a.priceCents || 0), 0);

    const faturamentoMes = monthAppointments
      .filter((a) => a.status === 'confirmado' || a.status === 'concluido')
      .reduce((sum, a) => sum + (a.priceCents || 0), 0);

    const cancelMes = monthAppointments.filter((a) => a.status === 'cancelado').length;

    const proximos = monthAppointments
      .filter((a) => a.startAt >= now && a.status !== 'cancelado')
      .sort((a, b) => a.startAt - b.startAt)
      .slice(0, 5);

    const countsByService: Record<string, number> = {};
    monthAppointments.forEach((a) => {
      const key = a.serviceName || 'Serviço';
      countsByService[key] = (countsByService[key] || 0) + 1;
    });
    const topServices = Object.entries(countsByService)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));

    const totalSlotsPerProfessional = Math.floor(((settings.businessHours.closeHour - settings.businessHours.openHour) * 60) / 60);
    const totalSlots = professionals.length * totalSlotsPerProfessional;
    const remainingSlots = Math.max(0, totalSlots - agDia);

    return {
      totalClientes,
      vip,
      agDia,
      cancDia,
      pendDia,
      confDia,
      aCaminhoDia,
      faturamentoDia,
      faturamentoMes,
      cancelMes,
      proximos,
      topServices,
      remainingSlots,
    };
  }, [dayAppointments, monthAppointments, professionals.length, settings.businessHours.closeHour, settings.businessHours.openHour, users]);

  const openAppointment = (a: Appointment) => {
    setAppointmentSelected(a);
    setAppointmentNotesValue(a.notes || '');
    setAppointmentModalOpen(true);
  };

  const runSafe = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErrorText(null);
    try {
      await fn();
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível concluir a ação');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!appointmentSelected || !currentUser) return;
    await runSafe(async () => {
      await setAppointmentStatus(appointmentSelected.id, 'confirmado');
      await createNotification({
        target: 'cliente',
        targetUserId: appointmentSelected.userId,
        type: 'confirmacao_agendamento',
        title: 'Agendamento confirmado',
        body: `Seu agendamento de ${appointmentSelected.serviceName} foi confirmado para ${formatDateLabel(appointmentSelected.startAt)} às ${formatTime(
          appointmentSelected.startAt,
        )}.`,
        appointmentId: appointmentSelected.id,
      });
      createAdminLog({
        actor: currentUser,
        action: 'approve_appointment',
        entityType: 'appointment',
        entityId: appointmentSelected.id,
        summary: `Agendamento aprovado: ${appointmentSelected.userName}`,
        meta: { status: 'confirmado' },
      });
      Taro.showToast({ title: 'Aprovado', icon: 'success' });
      setAppointmentModalOpen(false);
    });
  };

  const handleOpenPaymentFinalize = () => {
    if (!appointmentSelected) return;
    const cents = appointmentSelected.priceCents || 0;
    setPaymentAmount(String(Math.round(cents / 100) || 0));
    setPaymentMethod('pix');
    setPaymentOpen(true);
  };

  const handleConfirmPaymentFinalize = async () => {
    if (!appointmentSelected || !currentUser) return;
    const amountCents = Math.max(0, Number(paymentAmount) || 0) * 100;
    await runSafe(async () => {
      await setAppointmentStatus(appointmentSelected.id, 'concluido', {
        actor: currentUser,
        appointment: appointmentSelected,
        payment: { amountCents, method: paymentMethod },
      });
      await createNotification({
        target: 'cliente',
        targetUserId: appointmentSelected.userId,
        type: 'alteracao_agendamento',
        title: 'Atendimento finalizado',
        body: 'Obrigada! Seu atendimento foi finalizado. Se quiser, deixe sua avaliação.',
        appointmentId: appointmentSelected.id,
      });
      createAdminLog({
        actor: currentUser,
        action: 'finalize_appointment',
        entityType: 'appointment',
        entityId: appointmentSelected.id,
        summary: `Atendimento finalizado: ${appointmentSelected.userName}`,
        meta: { amountCents, method: paymentMethod },
      });
      createAdminLog({
        actor: currentUser,
        action: 'create_payment',
        entityType: 'payment',
        entityId: appointmentSelected.id,
        summary: `Pagamento registrado: ${appointmentSelected.userName}`,
        meta: { amountCents, method: paymentMethod },
      });
      Taro.showToast({ title: 'Finalizado', icon: 'success' });
      setPaymentOpen(false);
      setAppointmentModalOpen(false);
    });
  };

  const handleSaveNotes = async () => {
    if (!appointmentSelected) return;
    await runSafe(async () => {
      await setAppointmentNotes(appointmentSelected.id, appointmentNotes);
      if (currentUser) {
        createAdminLog({
          actor: currentUser,
          action: 'update_appointment_notes',
          entityType: 'appointment',
          entityId: appointmentSelected.id,
          summary: `Observação atualizada: ${appointmentSelected.userName}`,
        });
      }
      Taro.showToast({ title: 'Observações salvas', icon: 'success' });
    });
  };

  const handleCancel = async () => {
    if (!appointmentSelected) return;
    await runSafe(async () => {
      await cancelAppointment(appointmentSelected.id);
      await createNotification({
        target: 'cliente',
        targetUserId: appointmentSelected.userId,
        type: 'cancelamento_agendamento',
        title: 'Agendamento cancelado',
        body: `Seu agendamento de ${appointmentSelected.serviceName} foi cancelado. Se precisar, reagende pelo app.`,
        appointmentId: appointmentSelected.id,
      });
      if (currentUser) {
        createAdminLog({
          actor: currentUser,
          action: 'cancel_appointment',
          entityType: 'appointment',
          entityId: appointmentSelected.id,
          summary: `Agendamento cancelado: ${appointmentSelected.userName}`,
        });
      }
      Taro.showToast({ title: 'Cancelado', icon: 'success' });
      setConfirmCancelOpen(false);
      setAppointmentModalOpen(false);
    });
  };

  const rescheduleSlots = useMemo(() => {
    if (!appointmentSelected) return [];
    const durationMinutes = appointmentSelected.durationMinutes;
    const professionalId = appointmentSelected.professionalId;

    const busyRanges = dayAppointments
      .filter((a) => a.professionalId === professionalId && a.id !== appointmentSelected.id && a.status !== 'cancelado')
      .map((a) => ({ startAt: a.startAt, endAt: a.endAt, status: a.status }));

    return buildSlotsForDay({ dateMs: rescheduleDateMs, durationMinutes, busy: busyRanges });
  }, [appointmentSelected, dayAppointments, rescheduleDateMs]);

  const handleOpenReschedule = () => {
    if (!appointmentSelected) return;
    setRescheduleDateMs(appointmentSelected.startAt);
    setRescheduleSlotStartAt(null);
    setRescheduleOpen(true);
  };

  const handleConfirmReschedule = async () => {
    if (!appointmentSelected || !rescheduleSlotStartAt) {
      setErrorText('Selecione um horário');
      return;
    }
    await runSafe(async () => {
      const startAt = rescheduleSlotStartAt;
      const endAt = startAt + appointmentSelected.durationMinutes * 60 * 1000;
      await rescheduleAppointment({
        appointmentId: appointmentSelected.id,
        professionalId: appointmentSelected.professionalId,
        professionalName: appointmentSelected.professionalName,
        startAt,
        endAt,
      });
      await createNotification({
        target: 'cliente',
        targetUserId: appointmentSelected.userId,
        type: 'alteracao_agendamento',
        title: 'Agendamento alterado',
        body: `Seu agendamento foi atualizado para ${formatDateLabel(startAt)} às ${formatTime(startAt)}.`,
        appointmentId: appointmentSelected.id,
      });
      if (currentUser) {
        createAdminLog({
          actor: currentUser,
          action: 'reschedule_appointment',
          entityType: 'appointment',
          entityId: appointmentSelected.id,
          summary: `Agendamento reagendado: ${appointmentSelected.userName}`,
          meta: { startAt, endAt },
        });
      }
      Taro.showToast({ title: 'Reagendado', icon: 'success' });
      setRescheduleOpen(false);
      setAppointmentModalOpen(false);
    });
  };

  const startCreateService = () => {
    setServiceEditingId(null);
    setServiceName('');
    setServiceDesc('');
    setServicePrice('0');
    setServiceDuration('60');
    setServiceActive(true);
    setServiceImageUrl('');
    setServiceSort('1');
    setServiceEditorOpen(true);
  };

  const startEditService = (s: ServiceItem) => {
    setServiceEditingId(s.id);
    setServiceName(s.name || '');
    setServiceDesc(s.description || '');
    setServicePrice(String(Math.round((s.priceCents || 0) / 100)));
    setServiceDuration(String(s.durationMinutes || 60));
    setServiceActive(s.active !== false);
    setServiceImageUrl(s.imageUrl || '');
    setServiceSort(String(s.sortOrder ?? 1));
    setServiceEditorOpen(true);
  };

  const handlePickServiceImage = async () => {
    try {
      const result = await Taro.chooseImage({ count: 1 });
      const path = result.tempFilePaths?.[0];
      if (path) setServiceImageUrl(path);
    } catch (error) {
      console.error('[Admin] falha ao selecionar imagem', error);
    }
  };

  const handleSaveService = async () => {
    const name = serviceName.trim();
    if (!name) return setErrorText('Informe o nome do serviço');
    const priceCents = Math.max(0, Number(servicePrice) || 0) * 100;
    const durationMinutes = Math.max(10, Number(serviceDuration) || 60);
    const sortOrder = Math.max(1, Number(serviceSort) || 1);

    await runSafe(async () => {
      const imageUrl =
        serviceImageUrl && !serviceImageUrl.startsWith('http')
          ? await uploadImageFromPath({ filePath: serviceImageUrl, target: 'services', fileNamePrefix: name })
          : serviceImageUrl.trim() || undefined;

      await upsertService(serviceEditingId, {
        name,
        description: serviceDesc.trim(),
        durationMinutes,
        priceCents,
        active: serviceActive,
        imageUrl,
        sortOrder,
      });
      if (currentUser) {
        createAdminLog({
          actor: currentUser,
          action: 'upsert_service',
          entityType: 'service',
          entityId: serviceEditingId || undefined,
          summary: serviceEditingId ? `Serviço atualizado: ${name}` : `Serviço criado: ${name}`,
          meta: { durationMinutes, priceCents, active: serviceActive, sortOrder },
        });
      }
      Taro.showToast({ title: 'Serviço salvo', icon: 'success' });
      setServiceEditorOpen(false);
    });
  };

  const startCreatePromo = () => {
    setPromoEditingId(null);
    setPromoKind('promocao');
    setPromoTitle('');
    setPromoDesc('');
    setPromoActive(true);
    setPromoImageUrl('');
    setPromoStartAt('');
    setPromoEndAt('');
    setPromoEditorOpen(true);
  };

  const startEditPromo = (p: Promotion) => {
    setPromoEditingId(p.id);
    setPromoKind(p.kind || 'promocao');
    setPromoTitle(p.title || '');
    setPromoDesc(p.description || '');
    setPromoActive(p.active !== false);
    setPromoImageUrl(p.imageUrl || '');
    setPromoStartAt(p.startAt ? toISODate(p.startAt) : '');
    setPromoEndAt(p.endAt ? toISODate(p.endAt) : '');
    setPromoEditorOpen(true);
  };

  const handlePickPromoImage = async () => {
    try {
      const result = await Taro.chooseImage({ count: 1 });
      const path = result.tempFilePaths?.[0];
      if (path) setPromoImageUrl(path);
    } catch (error) {
      console.error('[Admin] falha ao selecionar imagem', error);
    }
  };

  const handleSavePromo = async () => {
    const title = promoTitle.trim();
    if (!title) return setErrorText('Informe o título');
    await runSafe(async () => {
      const startAt = promoStartAt ? new Date(`${promoStartAt}T00:00:00`).getTime() : undefined;
      const endAt = promoEndAt ? new Date(`${promoEndAt}T23:59:59`).getTime() : undefined;
      const imageUrl =
        promoImageUrl && !promoImageUrl.startsWith('http')
          ? await uploadImageFromPath({ filePath: promoImageUrl, target: 'promotions', fileNamePrefix: title })
          : promoImageUrl.trim() || undefined;
      await upsertPromotion(promoEditingId, {
        kind: promoKind,
        title,
        description: promoDesc.trim(),
        active: promoActive,
        imageUrl,
        startAt,
        endAt,
      } as any);
      if (currentUser) {
        createAdminLog({
          actor: currentUser,
          action: 'upsert_promotion',
          entityType: 'promotion',
          entityId: promoEditingId || undefined,
          summary: promoEditingId ? `Publicação atualizada: ${title}` : `Publicação criada: ${title}`,
          meta: { kind: promoKind, active: promoActive, startAt, endAt },
        });
      }
      Taro.showToast({ title: 'Publicação salva', icon: 'success' });
      setPromoEditorOpen(false);
    });
  };

  const openClientEditor = (u: UserProfile) => {
    setClientSelected(u);
    setClientVip(Boolean(u.vip));
    setClientBlocked(Boolean(u.blocked));
    setClientNotes(u.adminNotes || '');
    setClientEditorOpen(true);
  };

  const handleSaveClient = async () => {
    if (!clientSelected) return;
    await runSafe(async () => {
      await setUserAdminFields(clientSelected.id, {
        vip: clientVip,
        blocked: clientBlocked,
        adminNotes: clientNotes.trim() || undefined,
      });
      if (currentUser) {
        createAdminLog({
          actor: currentUser,
          action: 'update_client',
          entityType: 'client',
          entityId: clientSelected.id,
          summary: `Cliente atualizado: ${clientSelected.socialName || clientSelected.fullName}`,
          meta: { vip: clientVip, blocked: clientBlocked },
        });
      }
      Taro.showToast({ title: 'Cliente atualizado', icon: 'success' });
      setClientEditorOpen(false);
    });
  };

  const toggleWorkingDay = (day: number) => {
    setSettingsWorkingDays((prev) => {
      const list = Array.isArray(prev) ? prev.slice() : [];
      const idx = list.indexOf(day);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(day);
      return list.slice().sort((a, b) => a - b);
    });
  };

  const handlePickLogo = async () => {
    try {
      const result = await Taro.chooseImage({ count: 1 });
      const path = result.tempFilePaths?.[0];
      if (path) setSettingsLogoUrl(path);
    } catch (error) {
      console.error('[Admin] falha ao selecionar logotipo', error);
    }
  };

  const handlePickBanner = async () => {
    try {
      const result = await Taro.chooseImage({ count: 1 });
      const path = result.tempFilePaths?.[0];
      if (path) setSettingsBannerUrl(path);
    } catch (error) {
      console.error('[Admin] falha ao selecionar banner', error);
    }
  };

  const handleSaveSettings = async () => {
    const appName = settingsAppName.trim() || 'Gabi Manicure';
    const openHour = Math.max(0, Math.min(23, Number(settingsOpenHour) || 9));
    const closeHour = Math.max(0, Math.min(23, Number(settingsCloseHour) || 19));
    if (closeHour <= openHour) return setErrorText('Horário de fechamento deve ser maior que o de abertura');

    await runSafe(async () => {
      const reminderMinutes = Math.max(5, Number(settingsReminderMinutes) || 120);
      const workingDays = (settingsWorkingDays || []).slice().sort((a, b) => a - b);

      const logoUrl =
        settingsLogoUrl && !settingsLogoUrl.startsWith('http')
          ? await uploadImageFromPath({ filePath: settingsLogoUrl, target: 'branding', fileNamePrefix: 'logo' })
          : settingsLogoUrl.trim() || undefined;
      const bannerUrl =
        settingsBannerUrl && !settingsBannerUrl.startsWith('http')
          ? await uploadImageFromPath({ filePath: settingsBannerUrl, target: 'branding', fileNamePrefix: 'banner' })
          : settingsBannerUrl.trim() || undefined;

      await updateAppSettings({
        appName,
        adminWhatsAppE164: settingsWhatsApp.trim(),
        businessHours: { openHour, closeHour },
        workingDays,
        notificationsEnabled: settingsNotifications,
        reminderMinutes,
        allowDarkMode: settingsAllowDarkMode,
        theme: {
          primary: settingsPrimary.trim() || undefined,
          primaryLight: settingsPrimaryLight.trim() || undefined,
          primaryDark: settingsPrimaryDark.trim() || undefined,
          accent: settingsAccent.trim() || undefined,
        },
        logoUrl,
        bannerUrls: bannerUrl ? [bannerUrl] : [],
      });
      if (currentUser) {
        createAdminLog({
          actor: currentUser,
          action: 'update_settings',
          entityType: 'settings',
          summary: 'Configurações administrativas atualizadas',
          meta: { appName, openHour, closeHour, notificationsEnabled: settingsNotifications, allowDarkMode: settingsAllowDarkMode, reminderMinutes, workingDays },
        });
      }
      Taro.showToast({ title: 'Configurações salvas', icon: 'success' });
    });
  };

  const clientsBySpend = useMemo(() => {
    const sumByUser: Record<string, number> = {};
    monthAppointments.forEach((a) => {
      if (a.status === 'cancelado') return;
      sumByUser[a.userId] = (sumByUser[a.userId] || 0) + (a.priceCents || 0);
    });
    return Object.entries(sumByUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([userId, cents]) => {
        const u = users.find((x) => x.id === userId);
        return { userId, name: u?.socialName || u?.fullName || 'Cliente', cents };
      });
  }, [monthAppointments, users]);

  const chartItems: BarChartItem[] = useMemo(() => {
    return (stats.topServices.length ? stats.topServices : [{ label: 'Sem dados', value: 1 }]) as BarChartItem[];
  }, [stats.topServices]);

  const financeDailyChart = useMemo<BarChartItem[]>(() => {
    const items = financeAgg.daySeries.slice(-14).map((d) => ({ label: dayjs(d.dayMs).format('DD/MM'), value: Math.round(d.cents / 100) }));
    return items.length ? items : [{ label: '—', value: 0 }];
  }, [financeAgg.daySeries]);

  const financeMonthChange = useMemo(() => {
    const current = financeMonthlyTrend.currentMonthCents || 0;
    const previous = financeMonthlyTrend.previousMonthCents || 0;
    const delta = current - previous;
    const pct = previous > 0 ? Math.round((delta / previous) * 100) : current > 0 ? 100 : 0;
    return { current, previous, delta, pct };
  }, [financeMonthlyTrend.currentMonthCents, financeMonthlyTrend.previousMonthCents]);

  function paymentMethodLabel(method: PaymentMethod | 'todas'): string {
    if (method === 'todas') return 'todas';
    if (method === 'pix') return 'PIX';
    if (method === 'dinheiro') return 'dinheiro';
    if (method === 'credito') return 'cartão crédito';
    return 'cartão débito';
  }

  const handleLoadMorePayments = async () => {
    if (financeLoadingMore) return;
    if (!financeAfterPaidAt) return;
    setFinanceLoadingMore(true);
    try {
      const startMs = startOfDayMs(new Date(`${financeStart}T00:00:00`).getTime());
      const endMs = endOfDayMs(new Date(`${financeEnd}T00:00:00`).getTime());
      const page = await fetchPaymentsRangePage({
        startAt: startMs,
        endAt: endMs,
        method: financeMethod,
        pageSize: financePageSize,
        afterPaidAt: financeAfterPaidAt,
        afterCursor: financeAfterCursorRef.current,
      });
      if (page.items.length) {
        setFinanceLoadedMore(true);
        setFinanceHistory((prev) => {
          const byId = new Map<string, PaymentRecord>();
          prev.forEach((p) => byId.set(p.id, p));
          page.items.forEach((p) => byId.set(p.id, p));
          return Array.from(byId.values()).sort((a, b) => b.paidAt - a.paidAt);
        });
        financeAfterCursorRef.current = page.nextAfterCursor;
        setFinanceAfterPaidAt(page.nextAfterPaidAt);
        setFinanceHasMore(page.items.length === financePageSize && Boolean(page.nextAfterPaidAt));
      } else {
        setFinanceHasMore(false);
      }
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível carregar mais pagamentos');
    } finally {
      setFinanceLoadingMore(false);
    }
  };

  const handleExportExcel = async () => {
    if (!currentUser) return;
    setExporting(true);
    try {
      const startMs = startOfDayMs(new Date(`${financeStart}T00:00:00`).getTime());
      const endMs = endOfDayMs(new Date(`${financeEnd}T00:00:00`).getTime());
      const rows = await fetchPaymentsRangeAll({ startAt: startMs, endAt: endMs, method: financeMethod });

      const data = rows.map((p) => ({
        Cliente: p.userName,
        Telefone: p.phoneE164,
        Serviço: p.serviceName,
        Profissional: p.professionalName,
        Data: formatDateLabel(p.paidAt),
        Hora: formatTime(p.paidAt),
        Valor: priceFromCents(p.amountCents),
        'Forma de pagamento': paymentMethodLabel(p.method as any),
        Status: p.appointmentStatus,
      }));

      let xlsx: any;
      try {
        xlsx = await import('xlsx');
      } catch {
        throw new Error('Dependência "xlsx" não instalada. Instale as dependências do projeto e tente novamente.');
      }
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Financeiro');
      const buffer = xlsx.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

      const fileName = `financeiro_${financeStart}_${financeEnd}.xlsx`;
      if (process.env.TARO_ENV === 'h5') {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const fs = Taro.getFileSystemManager();
        const path = `${Taro.env.USER_DATA_PATH}/${fileName}`;
        await new Promise<void>((resolve, reject) => {
          fs.writeFile({
            filePath: path,
            data: buffer as any,
            encoding: 'binary',
            success: () => resolve(),
            fail: (e: any) => reject(e),
          });
        });
        await Taro.openDocument({ filePath: path, fileType: 'xlsx' as any, showMenu: true } as any);
      }

      createAdminLog({
        actor: currentUser,
        action: 'export_report',
        entityType: 'admin',
        summary: 'Relatório Excel gerado',
        meta: { financeStart, financeEnd, method: financeMethod, format: 'xlsx', rows: rows.length },
      });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível gerar o Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!currentUser) return;
    setExporting(true);
    try {
      const startMs = startOfDayMs(new Date(`${financeStart}T00:00:00`).getTime());
      const endMs = endOfDayMs(new Date(`${financeEnd}T00:00:00`).getTime());
      const rows = await fetchPaymentsRangeAll({ startAt: startMs, endAt: endMs, method: financeMethod });

      let jsPDF: any;
      let autoTable: any;
      try {
        jsPDF = (await import('jspdf')).jsPDF;
        autoTable = (await import('jspdf-autotable')).default as any;
      } catch {
        throw new Error('Dependências "jspdf" e/ou "jspdf-autotable" não instaladas. Instale as dependências do projeto e tente novamente.');
      }
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

      doc.setFontSize(14);
      doc.text(`Relatório financeiro (${financeStart} a ${financeEnd})`, 40, 40);
      doc.setFontSize(10);
      doc.text(`Forma de pagamento: ${paymentMethodLabel(financeMethod)}`, 40, 60);

      const head = [['Cliente', 'Serviço', 'Data', 'Hora', 'Valor', 'Pagamento', 'Status']];
      const body = rows.map((p) => [
        p.userName,
        p.serviceName,
        formatDateLabel(p.paidAt),
        formatTime(p.paidAt),
        priceFromCents(p.amountCents),
        paymentMethodLabel(p.method as any),
        p.appointmentStatus,
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 80,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [232, 85, 143] },
      });

      const fileName = `financeiro_${financeStart}_${financeEnd}.pdf`;
      if (process.env.TARO_ENV === 'h5') {
        doc.save(fileName);
      } else {
        const pdfArrayBuffer = doc.output('arraybuffer');
        const fs = Taro.getFileSystemManager();
        const path = `${Taro.env.USER_DATA_PATH}/${fileName}`;
        await new Promise<void>((resolve, reject) => {
          fs.writeFile({
            filePath: path,
            data: pdfArrayBuffer as any,
            encoding: 'binary',
            success: () => resolve(),
            fail: (e: any) => reject(e),
          });
        });
        await Taro.openDocument({ filePath: path, fileType: 'pdf', showMenu: true });
      }

      createAdminLog({
        actor: currentUser,
        action: 'export_report',
        entityType: 'admin',
        summary: 'Relatório PDF gerado',
        meta: { financeStart, financeEnd, method: financeMethod, format: 'pdf', rows: rows.length },
      });
    } catch (error: any) {
      setErrorText(error?.message || 'Não foi possível gerar o PDF');
    } finally {
      setExporting(false);
    }
  };

  if (checking) {
    return (
      <View className={styles.container}>
        <LoadingOverlay visible title="Carregando…" description="Validando permissões de administrador." />
      </View>
    );
  }

  if (!allowed) {
    return <View className={styles.container} />;
  }

  return (
    <View className={styles.container}>
      <LoadingOverlay visible={busy} title="Aguarde…" description="Salvando alterações e atualizando em tempo real." />

      <View className={styles.header}>
        <View className={styles.titleRow}>
          <View style={{ display: 'flex', alignItems: 'center', gap: '16rpx' }}>
            {settings.logoUrl ? (
              <Image src={settings.logoUrl} mode="aspectFit" style={{ width: '56rpx', height: '56rpx', borderRadius: '18rpx' }} />
            ) : null}
            <Text className={styles.title}>{settings.appName || 'Painel Admin'}</Text>
            <View className={styles.pill}>
              <Text className={styles.pillText}>Admin</Text>
            </View>
          </View>
          <View className={styles.row} style={{ justifyContent: 'flex-end' }}>
            <View className={styles.pill}>
              <Text className={styles.pillText}>{currentUser?.email || 'e-mail não informado'}</Text>
            </View>
            <Button className={styles.btnSecondary} onClick={() => Taro.switchTab({ url: '/pages/index/index' })}>
              <Text className={styles.btnSecondaryText}>Voltar</Text>
            </Button>
          </View>
        </View>
        <Text className={styles.subtitle}>Todos os módulos começam recolhidos. Expanda apenas o que desejar.</Text>
      </View>

      <View className={styles.content}>
        {errorText ? (
          <View className={styles.listItem}>
            <Text className={classnames(styles.listSub, styles.dangerText)}>{errorText}</Text>
          </View>
        ) : null}

        <View className={styles.stack}>
          <AdminAccordion
            title="Dashboard"
            subtitle="Indicadores em tempo real e visão geral do negócio."
            open={open.dashboard}
            onToggle={() => setOpen((p) => ({ ...p, dashboard: !p.dashboard }))}
          >
            <View className={styles.grid2}>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Total de clientes</Text>
                <Text className={styles.statValue}>{stats.totalClientes}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Clientes VIP</Text>
                <Text className={styles.statValue}>{stats.vip}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Agendamentos do dia</Text>
                <Text className={styles.statValue}>{stats.agDia}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Cancelamentos do dia</Text>
                <Text className={styles.statValue}>{stats.cancDia}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Faturamento diário</Text>
                <Text className={styles.statValue}>{priceFromCents(stats.faturamentoDia)}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Faturamento mensal</Text>
                <Text className={styles.statValue}>{priceFromCents(stats.faturamentoMes)}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Pendentes hoje</Text>
                <Text className={styles.statValue}>{stats.pendDia}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Horários restantes (estimativa)</Text>
                <Text className={styles.statValue}>{stats.remainingSlots}</Text>
              </View>
            </View>

            <View className={styles.fieldLabel}>Serviços mais agendados (mês)</View>
            <MiniBarChart items={chartItems} />

            <View className={styles.fieldLabel}>Próximos horários</View>
            {stats.proximos.length ? (
              stats.proximos.map((a) => (
                <View key={a.id} className={styles.listItem} onClick={() => openAppointment(a)}>
                  <Text className={styles.listTitle}>{a.userName}</Text>
                  <Text className={styles.listSub}>
                    {a.serviceName} • {formatDateLabel(a.startAt)} às {formatTime(a.startAt)} • {a.professionalName}
                  </Text>
                  <View className={styles.badgeRow}>
                    <View className={classnames(styles.badge, styles.badgePrimary)}>
                      <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>{statusLabel(a.status, a.onMyWayAt)}</Text>
                    </View>
                    <View className={styles.badge}>
                      <Text className={styles.badgeText}>{priceFromCents(a.priceCents || 0)}</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Nenhum horário futuro encontrado.</Text>
              </View>
            )}

            <View className={styles.fieldLabel}>Clientes VIP por gasto (mês)</View>
            {clientsBySpend.length ? (
              clientsBySpend.map((c) => (
                <View key={c.userId} className={styles.listItem}>
                  <Text className={styles.listTitle}>{c.name}</Text>
                  <Text className={styles.listSub}>Total: {priceFromCents(c.cents)}</Text>
                </View>
              ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Sem dados suficientes.</Text>
              </View>
            )}
          </AdminAccordion>

          <AdminAccordion
            title="Controle de agendamentos"
            subtitle="Aprovar, reagendar, cancelar e organizar por filtros."
            open={open.appointments}
            badgeText={String(filteredDayAppointments.length)}
            onToggle={() => setOpen((p) => ({ ...p, appointments: !p.appointments }))}
          >
            <Text className={styles.fieldLabel}>Buscar por cliente, telefone ou serviço</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={searchText} onInput={(e) => setSearchText(e.detail.value)} placeholder="Ex.: Gabriela" />
            </View>

            <Text className={styles.fieldLabel}>Filtros</Text>
            <View className={styles.row}>
              <Picker
                mode="date"
                value={toISODate(filterDateMs)}
                onChange={(e) => {
                  const next = new Date(`${e.detail.value}T00:00:00`).getTime();
                  setFilterDateMs(next);
                }}
              >
                <View className={styles.pill}>
                  <Text className={styles.pillText}>{formatDateLabel(filterDateMs)}</Text>
                </View>
              </Picker>

              <Picker
                mode="selector"
                range={['todos', 'pendente', 'confirmado', 'cancelado', 'concluido']}
                onChange={(e) => {
                  const idx = Number(e.detail.value);
                  const value = (['todos', 'pendente', 'confirmado', 'cancelado', 'concluido'][idx] || 'todos') as any;
                  setFilterStatus(value);
                }}
              >
                <View className={styles.pill}>
                  <Text className={styles.pillText}>{filterStatus}</Text>
                </View>
              </Picker>
            </View>

            {filteredDayAppointments.length ? (
              filteredDayAppointments.map((a) => (
                <View key={a.id} className={styles.listItem} onClick={() => openAppointment(a)}>
                  <Text className={styles.listTitle}>{a.userName}</Text>
                  <Text className={styles.listSub}>
                    {a.serviceName} • {formatTime(a.startAt)} • {a.professionalName}
                  </Text>
                  <View className={styles.badgeRow}>
                    <View className={classnames(styles.badge, styles.badgePrimary)}>
                      <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>{statusLabel(a.status, a.onMyWayAt)}</Text>
                    </View>
                    <View className={styles.badge}>
                      <Text className={styles.badgeText}>{a.phoneE164}</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Nenhum agendamento encontrado para os filtros atuais.</Text>
              </View>
            )}
          </AdminAccordion>

          <AdminAccordion
            title="Financeiro"
            subtitle="Pagamentos, faturamento e relatórios."
            open={open.finance}
            badgeText={String(financeAgg.count)}
            onToggle={() => setOpen((p) => ({ ...p, finance: !p.finance }))}
          >
            <View className={styles.row}>
              <Button
                className={styles.btnSecondary}
                onClick={() => {
                  const today = toISODate(Date.now());
                  setFinanceStart(today);
                  setFinanceEnd(today);
                }}
              >
                <Text className={styles.btnSecondaryText}>Hoje</Text>
              </Button>
              <Button
                className={styles.btnSecondary}
                onClick={() => {
                  const end = dayjs().format('YYYY-MM-DD');
                  const start = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
                  setFinanceStart(start);
                  setFinanceEnd(end);
                }}
              >
                <Text className={styles.btnSecondaryText}>7 dias</Text>
              </Button>
              <Button
                className={styles.btnSecondary}
                onClick={() => {
                  const start = dayjs().startOf('month').format('YYYY-MM-DD');
                  const end = dayjs().endOf('month').format('YYYY-MM-DD');
                  setFinanceStart(start);
                  setFinanceEnd(end);
                }}
              >
                <Text className={styles.btnSecondaryText}>Mês</Text>
              </Button>
              <Button
                className={styles.btnSecondary}
                onClick={() => {
                  const start = dayjs().startOf('year').format('YYYY-MM-DD');
                  const end = dayjs().endOf('year').format('YYYY-MM-DD');
                  setFinanceStart(start);
                  setFinanceEnd(end);
                }}
              >
                <Text className={styles.btnSecondaryText}>Ano</Text>
              </Button>
            </View>

            <Text className={styles.fieldLabel}>Período</Text>
            <View className={styles.row}>
              <Picker mode="date" value={financeStart} onChange={(e) => setFinanceStart(e.detail.value)}>
                <View className={styles.pill}>
                  <Text className={styles.pillText}>{financeStart}</Text>
                </View>
              </Picker>
              <Picker mode="date" value={financeEnd} onChange={(e) => setFinanceEnd(e.detail.value)}>
                <View className={styles.pill}>
                  <Text className={styles.pillText}>{financeEnd}</Text>
                </View>
              </Picker>
              <Picker
                mode="selector"
                range={['todas', 'pix', 'dinheiro', 'credito', 'debito']}
                onChange={(e) => {
                  const idx = Number(e.detail.value);
                  const value = (['todas', 'pix', 'dinheiro', 'credito', 'debito'][idx] || 'todas') as any;
                  setFinanceMethod(value);
                }}
              >
                <View className={styles.pill}>
                  <Text className={styles.pillText}>{paymentMethodLabel(financeMethod)}</Text>
                </View>
              </Picker>
            </View>

            <View className={styles.grid2} style={{ marginTop: '16rpx' }}>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Faturamento diário</Text>
                <Text className={styles.statValue}>{priceFromCents(financeOverview.daily)}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Faturamento semanal</Text>
                <Text className={styles.statValue}>{priceFromCents(financeOverview.weekly)}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Faturamento mensal</Text>
                <Text className={styles.statValue}>{priceFromCents(financeOverview.monthly)}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Faturamento anual</Text>
                <Text className={styles.statValue}>{priceFromCents(financeOverview.yearly)}</Text>
              </View>
            </View>

            <View className={styles.grid2} style={{ marginTop: '16rpx' }}>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Valor recebido</Text>
                <Text className={styles.statValue}>{financeAggLoading ? '—' : priceFromCents(financeAgg.totalCents)}</Text>
              </View>
              <View className={styles.statCard}>
                <Text className={styles.statLabel}>Registros</Text>
                <Text className={styles.statValue}>{financeAggLoading ? '—' : financeAgg.count}</Text>
              </View>
            </View>

            <View className={styles.fieldLabel}>Comparação mensal (últimos 6 meses)</View>
            <MiniBarChart items={financeMonthlyTrend.items.length ? financeMonthlyTrend.items : [{ label: '—', value: 0 }]} />
            <View className={styles.listItem} style={{ marginTop: '12rpx' }}>
              <Text className={styles.listTitle}>Mês atual vs mês anterior</Text>
              <Text className={styles.listSub}>
                {priceFromCents(financeMonthChange.current)} • {financeMonthChange.delta >= 0 ? '+' : ''}
                {priceFromCents(financeMonthChange.delta)} ({financeMonthChange.pct}%)
              </Text>
            </View>

            <View className={styles.fieldLabel}>Faturamento (últimos dias)</View>
            <MiniBarChart items={financeDailyChart} />

            <View className={styles.fieldLabel}>Serviços mais lucrativos</View>
            {financeAgg.topServices.length ? (
              financeAgg.topServices.map((s) => (
                <View key={s.label} className={styles.listItem}>
                  <Text className={styles.listTitle}>{s.label}</Text>
                  <Text className={styles.listSub}>{priceFromCents(s.cents)}</Text>
                </View>
              ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Sem dados no período selecionado.</Text>
              </View>
            )}

            <View className={styles.fieldLabel}>Clientes que mais gastam</View>
            {financeAgg.topClients.length ? (
              financeAgg.topClients.map((c) => (
                <View key={c.label} className={styles.listItem}>
                  <Text className={styles.listTitle}>{c.label}</Text>
                  <Text className={styles.listSub}>{priceFromCents(c.cents)}</Text>
                </View>
              ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Sem dados no período selecionado.</Text>
              </View>
            )}

            <View className={styles.fieldLabel}>Histórico financeiro</View>
            {financeHistory.length ? (
              financeHistory.map((p) => (
                <View key={p.id} className={styles.listItem}>
                  <Text className={styles.listTitle}>{p.userName}</Text>
                  <Text className={styles.listSub}>
                    {p.serviceName} • {formatDateLabel(p.paidAt)} às {formatTime(p.paidAt)} • {paymentMethodLabel(p.method)}
                  </Text>
                  <View className={styles.badgeRow}>
                    <View className={classnames(styles.badge, styles.badgePrimary)}>
                      <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>{priceFromCents(p.amountCents)}</Text>
                    </View>
                    <View className={styles.badge}>
                      <Text className={styles.badgeText}>{p.phoneE164}</Text>
                    </View>
                    <View className={styles.badge}>
                      <Text className={styles.badgeText}>{p.appointmentStatus}</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Nenhum pagamento encontrado.</Text>
              </View>
            )}

            {financeHasMore ? (
              <View className={styles.modalActions}>
                <Button className={styles.modalBtn} disabled={financeLoadingMore} onClick={handleLoadMorePayments}>
                  <Text className={styles.modalBtnText}>{financeLoadingMore ? 'Carregando…' : 'Carregar mais'}</Text>
                </Button>
              </View>
            ) : null}

            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} disabled={exporting || financeLoadingMore} onClick={handleExportPdf}>
                <Text className={styles.modalBtnText}>Baixar PDF</Text>
              </Button>
              <Button
                className={classnames(styles.modalBtn, styles.modalBtnPrimary)}
                disabled={exporting || financeLoadingMore}
                onClick={handleExportExcel}
              >
                <Text className={styles.modalBtnTextWhite}>Baixar Excel</Text>
              </Button>
            </View>
          </AdminAccordion>

          <AdminAccordion
            title="Serviços"
            subtitle="Crie, edite e ative/desative serviços."
            open={open.services}
            badgeText={String(services.length)}
            onToggle={() => setOpen((p) => ({ ...p, services: !p.services }))}
          >
            <View className={styles.row}>
              <Button className={styles.btnPrimary} onClick={startCreateService}>
                <Text className={styles.btnPrimaryText}>Novo serviço</Text>
              </Button>
              <View className={styles.pill}>
                <Text className={styles.pillText}>Ordenação por prioridade</Text>
              </View>
            </View>

            {services.length ? (
              services
                .slice()
                .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
                .map((s) => (
                  <View key={s.id} className={styles.listItem} onClick={() => startEditService(s)}>
                    <Text className={styles.listTitle}>{s.name}</Text>
                    <Text className={styles.listSub}>
                      {s.durationMinutes} min • {priceFromCents(s.priceCents)} • {s.active === false ? 'inativo' : 'ativo'}
                    </Text>
                    <View className={styles.badgeRow}>
                      <View className={styles.badge}>
                        <Text className={styles.badgeText}>ordem {s.sortOrder ?? '-'}</Text>
                      </View>
                      {s.active === false ? (
                        <View className={styles.badge}>
                          <Text className={classnames(styles.badgeText, styles.dangerText)}>desativado</Text>
                        </View>
                      ) : (
                        <View className={classnames(styles.badge, styles.badgePrimary)}>
                          <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>ativo</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Sem serviços no Firebase. Você pode criar o primeiro agora.</Text>
              </View>
            )}
          </AdminAccordion>

          <AdminAccordion
            title="Promoções e avisos"
            subtitle="Crie banners e avisos exibidos no app do cliente."
            open={open.promotions}
            badgeText={String(promotions.length)}
            onToggle={() => setOpen((p) => ({ ...p, promotions: !p.promotions }))}
          >
            <View className={styles.row}>
              <Button className={styles.btnPrimary} onClick={startCreatePromo}>
                <Text className={styles.btnPrimaryText}>Nova publicação</Text>
              </Button>
              <View className={styles.pill}>
                <Text className={styles.pillText}>Ative/desative rapidamente</Text>
              </View>
            </View>

            {promotions.length ? (
              promotions.map((p) => (
                <View key={p.id} className={styles.listItem} onClick={() => startEditPromo(p)}>
                  <Text className={styles.listTitle}>{p.title}</Text>
                  <Text className={styles.listSub}>{p.description}</Text>
                  <View className={styles.badgeRow}>
                    <View className={styles.badge}>
                      <Text className={styles.badgeText}>{p.kind || 'promocao'}</Text>
                    </View>
                    {p.active === false ? (
                      <View className={styles.badge}>
                        <Text className={classnames(styles.badgeText, styles.dangerText)}>inativo</Text>
                      </View>
                    ) : (
                      <View className={classnames(styles.badge, styles.badgePrimary)}>
                        <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>ativo</Text>
                      </View>
                    )}
                    {p.startAt ? (
                      <View className={styles.badge}>
                        <Text className={styles.badgeText}>início {formatDateLabel(p.startAt)}</Text>
                      </View>
                    ) : null}
                    {p.endAt ? (
                      <View className={styles.badge}>
                        <Text className={styles.badgeText}>término {formatDateLabel(p.endAt)}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Sem publicações no Firebase. Crie banners e avisos aqui.</Text>
              </View>
            )}
          </AdminAccordion>

          <AdminAccordion
            title="Gestão de clientes"
            subtitle="VIP, bloqueio, observações privadas e histórico."
            open={open.clients}
            badgeText={String(users.length)}
            onToggle={() => setOpen((p) => ({ ...p, clients: !p.clients }))}
          >
            <Text className={styles.fieldLabel}>Buscar cliente</Text>
            <View className={styles.inputRow}>
              <Input
                className={styles.input}
                value={searchText}
                onInput={(e) => setSearchText(e.detail.value)}
                placeholder="Buscar por nome ou telefone"
              />
            </View>

            {users.length ? (
              users
                .filter((u) => {
                  const q = (searchText || '').trim().toLowerCase();
                  if (!q) return true;
                  return (
                    (u.fullName || '').toLowerCase().includes(q) ||
                    (u.socialName || '').toLowerCase().includes(q) ||
                    (u.phoneE164 || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 80)
                .map((u) => (
                  <View key={u.id} className={styles.listItem} onClick={() => openClientEditor(u)}>
                    <Text className={styles.listTitle}>{u.socialName || u.fullName}</Text>
                    <Text className={styles.listSub}>{u.phoneE164 || '-'} • {u.email || 'sem e-mail'}</Text>
                    <View className={styles.badgeRow}>
                      {u.vip ? (
                        <View className={classnames(styles.badge, styles.badgePrimary)}>
                          <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>VIP</Text>
                        </View>
                      ) : null}
                      {u.blocked ? (
                        <View className={styles.badge}>
                          <Text className={classnames(styles.badgeText, styles.dangerText)}>bloqueado</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
            ) : (
              <View className={styles.listItem}>
                <Text className={styles.listSub}>Sem clientes carregados. Configure o Firebase para ver todos.</Text>
              </View>
            )}
          </AdminAccordion>

          <AdminAccordion
            title="Configurações administrativas"
            subtitle="Nome do app, cores, horário de funcionamento, WhatsApp e notificações."
            open={open.settings}
            onToggle={() => setOpen((p) => ({ ...p, settings: !p.settings }))}
          >
            <Text className={styles.fieldLabel}>Nome do aplicativo</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={settingsAppName} onInput={(e) => setSettingsAppName(e.detail.value)} placeholder="Nome do app" />
            </View>

            <Text className={styles.fieldLabel}>Logotipo do app</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={handlePickLogo}>
                <Text className={styles.btnSecondaryText}>Selecionar</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={() => setSettingsLogoUrl('')}>
                <Text className={styles.btnSecondaryText}>Remover</Text>
              </Button>
            </View>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={settingsLogoUrl} onInput={(e) => setSettingsLogoUrl(e.detail.value)} placeholder="URL ou caminho da imagem" />
            </View>
            {settingsLogoUrl ? (
              <View className={styles.listItem}>
                <Image src={settingsLogoUrl} mode="aspectFit" style={{ width: '100%', height: '220rpx', borderRadius: '20rpx' }} />
              </View>
            ) : null}

            <Text className={styles.fieldLabel}>Banner principal</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={handlePickBanner}>
                <Text className={styles.btnSecondaryText}>Selecionar</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={() => setSettingsBannerUrl('')}>
                <Text className={styles.btnSecondaryText}>Remover</Text>
              </Button>
            </View>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={settingsBannerUrl} onInput={(e) => setSettingsBannerUrl(e.detail.value)} placeholder="URL ou caminho da imagem" />
            </View>
            {settingsBannerUrl ? (
              <View className={styles.listItem}>
                <Image src={settingsBannerUrl} mode="aspectFill" style={{ width: '100%', height: '260rpx', borderRadius: '20rpx' }} />
              </View>
            ) : null}

            <Text className={styles.fieldLabel}>WhatsApp da administradora (E.164)</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={settingsWhatsApp} onInput={(e) => setSettingsWhatsApp(e.detail.value)} placeholder="+5511999998888" />
            </View>

            <Text className={styles.fieldLabel}>Tema escuro</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={() => setSettingsAllowDarkMode((v) => !v)}>
                <Text className={styles.btnSecondaryText}>{settingsAllowDarkMode ? 'Ativado' : 'Desativado'}</Text>
              </Button>
            </View>

            <Text className={styles.fieldLabel}>Lembrete de notificação (minutos antes)</Text>
            <View className={styles.inputRow}>
              <Input
                className={styles.input}
                value={settingsReminderMinutes}
                onInput={(e) => setSettingsReminderMinutes(e.detail.value)}
                type="number"
                placeholder="120"
              />
            </View>

            <Text className={styles.fieldLabel}>Horário de funcionamento</Text>
            <View className={styles.row}>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={settingsOpenHour} onInput={(e) => setSettingsOpenHour(e.detail.value)} type="number" placeholder="Abertura" />
              </View>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={settingsCloseHour} onInput={(e) => setSettingsCloseHour(e.detail.value)} type="number" placeholder="Fechamento" />
              </View>
            </View>

            <Text className={styles.fieldLabel}>Dias de funcionamento</Text>
            <View className={styles.row} style={{ flexWrap: 'wrap' }}>
              {[
                { day: 0, label: 'Dom' },
                { day: 1, label: 'Seg' },
                { day: 2, label: 'Ter' },
                { day: 3, label: 'Qua' },
                { day: 4, label: 'Qui' },
                { day: 5, label: 'Sex' },
                { day: 6, label: 'Sáb' },
              ].map((d) => {
                const active = settingsWorkingDays.includes(d.day);
                return (
                  <Button
                    key={d.day}
                    className={active ? styles.btnPrimary : styles.btnSecondary}
                    onClick={() => toggleWorkingDay(d.day)}
                    style={{ marginRight: '12rpx', marginBottom: '12rpx' }}
                  >
                    <Text className={active ? styles.btnPrimaryText : styles.btnSecondaryText}>{d.label}</Text>
                  </Button>
                );
              })}
            </View>

            <Text className={styles.fieldLabel}>Cores principais (hex)</Text>
            <View className={styles.row}>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={settingsPrimary} onInput={(e) => setSettingsPrimary(e.detail.value)} placeholder="#e8558f" />
              </View>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={settingsAccent} onInput={(e) => setSettingsAccent(e.detail.value)} placeholder="#c9a227" />
              </View>
            </View>
            <View className={styles.row}>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={settingsPrimaryLight} onInput={(e) => setSettingsPrimaryLight(e.detail.value)} placeholder="#ff7fb3" />
              </View>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={settingsPrimaryDark} onInput={(e) => setSettingsPrimaryDark(e.detail.value)} placeholder="#c73774" />
              </View>
            </View>

            <Text className={styles.fieldLabel}>Notificações</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={() => setSettingsNotifications((v) => !v)}>
                <Text className={styles.btnSecondaryText}>{settingsNotifications ? 'Ativadas' : 'Desativadas'}</Text>
              </Button>
              <Button className={styles.btnPrimary} onClick={handleSaveSettings}>
                <Text className={styles.btnPrimaryText}>Salvar</Text>
              </Button>
            </View>
          </AdminAccordion>
        </View>
      </View>

      {appointmentModalOpen && appointmentSelected ? (
        <View className={styles.modalMask} onClick={() => setAppointmentModalOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>{appointmentSelected.userName}</Text>
            <Text className={styles.modalDesc}>
              {appointmentSelected.serviceName} • {formatDateLabel(appointmentSelected.startAt)} às {formatTime(appointmentSelected.startAt)} •{' '}
              {appointmentSelected.professionalName}
            </Text>

            <View className={styles.badgeRow}>
              <View className={classnames(styles.badge, styles.badgePrimary)}>
                <Text className={classnames(styles.badgeText, styles.badgePrimaryText)}>
                  {statusLabel(appointmentSelected.status, appointmentSelected.onMyWayAt)}
                </Text>
              </View>
              <View className={styles.badge}>
                <Text className={styles.badgeText}>{appointmentSelected.phoneE164}</Text>
              </View>
              <View className={styles.badge}>
                <Text className={styles.badgeText}>{priceFromCents(appointmentSelected.priceCents || 0)}</Text>
              </View>
            </View>

            <Text className={styles.fieldLabel}>Observações</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={appointmentNotes} onInput={(e) => setAppointmentNotesValue(e.detail.value)} placeholder="Observação interna" />
            </View>
            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} disabled={busy} onClick={handleSaveNotes}>
                <Text className={styles.modalBtnText}>Salvar obs.</Text>
              </Button>
              <Button className={classnames(styles.modalBtn, styles.modalBtnPrimary)} disabled={busy} onClick={handleApprove}>
                <Text className={styles.modalBtnTextWhite}>Aprovar</Text>
              </Button>
            </View>

            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} onClick={handleOpenReschedule}>
                <Text className={styles.modalBtnText}>Reagendar</Text>
              </Button>
              <Button className={styles.modalBtn} onClick={() => setConfirmCancelOpen(true)}>
                <Text className={classnames(styles.modalBtnText, styles.dangerText)}>Cancelar</Text>
              </Button>
            </View>

            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} onClick={handleOpenPaymentFinalize}>
                <Text className={styles.modalBtnText}>Pagamento</Text>
              </Button>
              <Button className={styles.modalBtn} onClick={() => setAppointmentModalOpen(false)}>
                <Text className={styles.modalBtnText}>Fechar</Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {confirmCancelOpen ? (
        <View className={styles.modalMask} onClick={() => setConfirmCancelOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>Confirmar cancelamento</Text>
            <Text className={styles.modalDesc}>Tem certeza que deseja cancelar este agendamento?</Text>
            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} onClick={() => setConfirmCancelOpen(false)}>
                <Text className={styles.modalBtnText}>Voltar</Text>
              </Button>
              <Button className={classnames(styles.modalBtn, styles.modalBtnPrimary)} disabled={busy} onClick={handleCancel}>
                <Text className={styles.modalBtnTextWhite}>Cancelar</Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {rescheduleOpen ? (
        <View className={styles.modalMask} onClick={() => setRescheduleOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>Reagendar</Text>
            <Text className={styles.modalDesc}>Escolha uma nova data e horário.</Text>

            <Text className={styles.fieldLabel}>Data</Text>
            <View className={styles.inputRow}>
              <Picker
                mode="date"
                value={toISODate(rescheduleDateMs)}
                onChange={(e) => {
                  const next = new Date(`${e.detail.value}T00:00:00`).getTime();
                  setRescheduleDateMs(next);
                  setRescheduleSlotStartAt(null);
                }}
              >
                <Text className={styles.listSub}>{formatDateLabel(rescheduleDateMs)}</Text>
              </Picker>
            </View>

            <Text className={styles.fieldLabel}>Horário</Text>
            <ScrollView scrollY style={{ maxHeight: '420rpx' }}>
              <View className={styles.badgeRow} style={{ marginTop: 0 }}>
                {rescheduleSlots.map((s) => {
                  const active = rescheduleSlotStartAt === s.startAt;
                  return (
                    <Button
                      key={`adm_slot_${s.startAt}`}
                      className={classnames(styles.pill, active && styles.badgePrimary)}
                      disabled={s.disabled}
                      onClick={() => setRescheduleSlotStartAt(s.startAt)}
                    >
                      <Text className={classnames(styles.pillText, active && styles.badgePrimaryText)}>{formatTime(s.startAt)}</Text>
                    </Button>
                  );
                })}
              </View>
            </ScrollView>

            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} onClick={() => setRescheduleOpen(false)}>
                <Text className={styles.modalBtnText}>Voltar</Text>
              </Button>
              <Button className={classnames(styles.modalBtn, styles.modalBtnPrimary)} disabled={busy} onClick={handleConfirmReschedule}>
                <Text className={styles.modalBtnTextWhite}>Confirmar</Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {paymentOpen && appointmentSelected ? (
        <View className={styles.modalMask} onClick={() => setPaymentOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>Registrar pagamento</Text>
            <Text className={styles.modalDesc}>
              {appointmentSelected.userName} • {appointmentSelected.serviceName} • {formatDateLabel(appointmentSelected.startAt)} às{' '}
              {formatTime(appointmentSelected.startAt)}
            </Text>

            <Text className={styles.fieldLabel}>Valor recebido (R$)</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={paymentAmount} onInput={(e) => setPaymentAmount(e.detail.value)} type="number" placeholder="Ex.: 55" />
            </View>

            <Text className={styles.fieldLabel}>Forma de pagamento</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={() => setPaymentMethod('pix')}>
                <Text className={styles.btnSecondaryText}>PIX</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={() => setPaymentMethod('dinheiro')}>
                <Text className={styles.btnSecondaryText}>Dinheiro</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={() => setPaymentMethod('credito')}>
                <Text className={styles.btnSecondaryText}>Crédito</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={() => setPaymentMethod('debito')}>
                <Text className={styles.btnSecondaryText}>Débito</Text>
              </Button>
            </View>

            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} onClick={() => setPaymentOpen(false)}>
                <Text className={styles.modalBtnText}>Voltar</Text>
              </Button>
              <Button className={classnames(styles.modalBtn, styles.modalBtnPrimary)} disabled={busy} onClick={handleConfirmPaymentFinalize}>
                <Text className={styles.modalBtnTextWhite}>Registrar e finalizar</Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {serviceEditorOpen ? (
        <View className={styles.modalMask} onClick={() => setServiceEditorOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>{serviceEditingId ? 'Editar serviço' : 'Novo serviço'}</Text>
            <Text className={styles.modalDesc}>Preencha as informações do serviço.</Text>

            <Text className={styles.fieldLabel}>Nome</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={serviceName} onInput={(e) => setServiceName(e.detail.value)} placeholder="Ex.: Manicure Tradicional" />
            </View>

            <Text className={styles.fieldLabel}>Descrição</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={serviceDesc} onInput={(e) => setServiceDesc(e.detail.value)} placeholder="Detalhes do serviço" />
            </View>

            <Text className={styles.fieldLabel}>Valor (R$)</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={servicePrice} onInput={(e) => setServicePrice(e.detail.value)} type="number" placeholder="Ex.: 55" />
            </View>

            <Text className={styles.fieldLabel}>Duração (min)</Text>
            <View className={styles.row}>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={serviceDuration} onInput={(e) => setServiceDuration(e.detail.value)} type="number" placeholder="Ex.: 60" />
              </View>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={serviceSort} onInput={(e) => setServiceSort(e.detail.value)} type="number" placeholder="Ordem" />
              </View>
            </View>

            <Text className={styles.fieldLabel}>Ativo</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={() => setServiceActive((v) => !v)}>
                <Text className={styles.btnSecondaryText}>{serviceActive ? 'Ativo' : 'Inativo'}</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={handlePickServiceImage}>
                <Text className={styles.btnSecondaryText}>Selecionar imagem</Text>
              </Button>
            </View>

            <Text className={styles.fieldLabel}>Imagem (URL ou arquivo selecionado)</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={serviceImageUrl} onInput={(e) => setServiceImageUrl(e.detail.value)} placeholder="URL da imagem" />
            </View>
            {serviceImageUrl ? (
              <View style={{ marginTop: '16rpx' }}>
                <Image src={serviceImageUrl} mode="aspectFill" style={{ width: '100%', height: '260rpx', borderRadius: '24rpx' }} />
              </View>
            ) : null}

            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} onClick={() => setServiceEditorOpen(false)}>
                <Text className={styles.modalBtnText}>Cancelar</Text>
              </Button>
              <Button className={classnames(styles.modalBtn, styles.modalBtnPrimary)} onClick={handleSaveService}>
                <Text className={styles.modalBtnTextWhite}>Salvar</Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {promoEditorOpen ? (
        <View className={styles.modalMask} onClick={() => setPromoEditorOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>{promoEditingId ? 'Editar publicação' : 'Nova publicação'}</Text>
            <Text className={styles.modalDesc}>Promoções e avisos aparecem no app do cliente.</Text>

            <Text className={styles.fieldLabel}>Tipo</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={() => setPromoKind('promocao')}>
                <Text className={styles.btnSecondaryText}>Promoção</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={() => setPromoKind('aviso')}>
                <Text className={styles.btnSecondaryText}>Aviso</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={() => setPromoActive((v) => !v)}>
                <Text className={styles.btnSecondaryText}>{promoActive ? 'Ativo' : 'Inativo'}</Text>
              </Button>
            </View>

            <Text className={styles.fieldLabel}>Título</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={promoTitle} onInput={(e) => setPromoTitle(e.detail.value)} placeholder="Título" />
            </View>

            <Text className={styles.fieldLabel}>Descrição</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={promoDesc} onInput={(e) => setPromoDesc(e.detail.value)} placeholder="Texto curto" />
            </View>

            <Text className={styles.fieldLabel}>Período (opcional)</Text>
            <View className={styles.row}>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={promoStartAt} onInput={(e) => setPromoStartAt(e.detail.value)} placeholder="AAAA-MM-DD" />
              </View>
              <View className={styles.inputRow} style={{ flex: 1 }}>
                <Input className={styles.input} value={promoEndAt} onInput={(e) => setPromoEndAt(e.detail.value)} placeholder="AAAA-MM-DD" />
              </View>
            </View>

            <Text className={styles.fieldLabel}>Imagem (banner)</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={handlePickPromoImage}>
                <Text className={styles.btnSecondaryText}>Selecionar imagem</Text>
              </Button>
            </View>
            <View className={styles.inputRow} style={{ marginTop: '12rpx' }}>
              <Input className={styles.input} value={promoImageUrl} onInput={(e) => setPromoImageUrl(e.detail.value)} placeholder="URL da imagem" />
            </View>
            {promoImageUrl ? (
              <View style={{ marginTop: '16rpx' }}>
                <Image src={promoImageUrl} mode="aspectFill" style={{ width: '100%', height: '260rpx', borderRadius: '24rpx' }} />
              </View>
            ) : null}

            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} onClick={() => setPromoEditorOpen(false)}>
                <Text className={styles.modalBtnText}>Cancelar</Text>
              </Button>
              <Button className={classnames(styles.modalBtn, styles.modalBtnPrimary)} onClick={handleSavePromo}>
                <Text className={styles.modalBtnTextWhite}>Salvar</Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      {clientEditorOpen && clientSelected ? (
        <View className={styles.modalMask} onClick={() => setClientEditorOpen(false)}>
          <View className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.modalTitle}>{clientSelected.socialName || clientSelected.fullName}</Text>
            <Text className={styles.modalDesc}>{clientSelected.phoneE164 || '-'} • {clientSelected.email || 'sem e-mail'}</Text>

            <Text className={styles.fieldLabel}>VIP</Text>
            <View className={styles.row}>
              <Button className={styles.btnSecondary} onClick={() => setClientVip((v) => !v)}>
                <Text className={styles.btnSecondaryText}>{clientVip ? 'VIP' : 'Normal'}</Text>
              </Button>
              <Button className={styles.btnSecondary} onClick={() => setClientBlocked((v) => !v)}>
                <Text className={styles.btnSecondaryText}>{clientBlocked ? 'Bloqueado' : 'Desbloqueado'}</Text>
              </Button>
            </View>

            <Text className={styles.fieldLabel}>Observações privadas</Text>
            <View className={styles.inputRow}>
              <Input className={styles.input} value={clientNotes} onInput={(e) => setClientNotes(e.detail.value)} placeholder="Anotações internas" />
            </View>

            <View className={styles.modalActions}>
              <Button className={styles.modalBtn} onClick={() => setClientEditorOpen(false)}>
                <Text className={styles.modalBtnText}>Cancelar</Text>
              </Button>
              <Button className={classnames(styles.modalBtn, styles.modalBtnPrimary)} onClick={handleSaveClient}>
                <Text className={styles.modalBtnTextWhite}>Salvar</Text>
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default AdminPage;
