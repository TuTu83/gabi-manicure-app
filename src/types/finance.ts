export type PaymentMethod = 'pix' | 'dinheiro' | 'credito' | 'debito' | 'outro';

export interface PaymentRecord {
  id: string;
  appointmentId: string;
  appointmentStatus: string;
  status?: 'paid' | 'void';

  userId: string;
  userName: string;
  phoneE164: string;

  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;

  amountCents: number;
  method: PaymentMethod;
  paidAt: number;

  createdAt: number;
  createdByUserId: string;
  createdByEmail?: string;
}
