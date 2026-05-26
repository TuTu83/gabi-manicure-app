export type PaymentMethod = 'pix' | 'dinheiro' | 'credito' | 'debito';

export interface PaymentRecord {
  id: string;
  appointmentId: string;
  appointmentStatus: string;

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

