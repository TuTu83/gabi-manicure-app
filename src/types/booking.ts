export type AppointmentStatus = 'pendente' | 'confirmado' | 'cancelado' | 'concluido';

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  defaultProfessionalId?: string;
  active?: boolean;
  imageUrl?: string;
  sortOrder?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface Professional {
  id: string;
  name: string;
  bio?: string;
}

export interface Promotion {
  id: string;
  kind?: 'promocao' | 'aviso';
  title: string;
  description: string;
  imageUrl?: string;
  startAt?: number;
  endAt?: number;
  active?: boolean;
}

export interface Appointment {
  id: string;
  userId: string;
  userName: string;
  phoneE164: string;

  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  priceCents?: number;
  professionalId: string;
  professionalName: string;

  startAt: number;
  endAt: number;
  status: AppointmentStatus;

  createdAt: number;
  updatedAt: number;

  notes?: string;
  onMyWayAt?: number;
  canceledAt?: number;
  completedAt?: number;
}

export interface AppointmentReview {
  id: string;
  appointmentId: string;
  userId: string;
  professionalId: string;
  serviceId: string;
  rating: number;
  comment?: string;
  createdAt: number;
}

export interface LoyaltySummary {
  points: number;
  nextRewardAt: number;
}

export interface WaitlistEntry {
  id: string;
  userId: string;
  userName: string;
  phoneE164: string;
  serviceId: string;
  professionalId: string;
  dateKey: string;
  createdAt: number;
}

export type NotificationType =
  | 'confirmacao_agendamento'
  | 'lembrete_agendamento'
  | 'alteracao_agendamento'
  | 'cancelamento_agendamento'
  | 'cliente_a_caminho';

export interface InAppNotification {
  id: string;
  target: 'cliente' | 'admin';
  targetUserId?: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: number;
  readAt?: number;
  appointmentId?: string;
}
