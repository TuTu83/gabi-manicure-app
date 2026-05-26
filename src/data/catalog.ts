import type { Professional, Promotion, ServiceItem } from '@/types/booking';

export const mockServices: ServiceItem[] = [
  {
    id: 'srv_manicure_tradicional',
    name: 'Manicure Tradicional',
    description: 'Cutilagem, lixamento e esmaltação.',
    durationMinutes: 60,
    priceCents: 5500,
    active: true,
    sortOrder: 1,
  },
  {
    id: 'srv_pedicure_tradicional',
    name: 'Pedicure Tradicional',
    description: 'Cuidados completos e esmaltação.',
    durationMinutes: 70,
    priceCents: 6500,
    active: true,
    sortOrder: 2,
  },
  {
    id: 'srv_gel',
    name: 'Banho de Gel',
    description: 'Nivelamento, resistência e brilho.',
    durationMinutes: 90,
    priceCents: 12000,
    active: true,
    sortOrder: 3,
  },
  {
    id: 'srv_fibra',
    name: 'Alongamento (Fibra)',
    description: 'Alongamento com acabamento premium.',
    durationMinutes: 150,
    priceCents: 20000,
    active: true,
    sortOrder: 4,
  },
  {
    id: 'srv_spa',
    name: 'SPA das Mãos',
    description: 'Hidratação profunda e relaxante.',
    durationMinutes: 40,
    priceCents: 4500,
    active: true,
    sortOrder: 5,
  },
];

export const mockProfessionals: Professional[] = [
  { id: 'pro_gabi', name: 'Gabi', bio: 'Especialista em acabamentos premium e gel.' },
  { id: 'pro_ana', name: 'Ana', bio: 'Cutilagem delicada e esmaltação perfeita.' },
];

export const mockPromotions: Promotion[] = [
  {
    id: 'promo_semana',
    kind: 'promocao',
    title: 'Semana do Brilho',
    description: 'Banho de gel com condição especial por tempo limitado.',
    active: true,
  },
  {
    id: 'promo_spa',
    kind: 'promocao',
    title: 'Combo Relax',
    description: 'SPA das mãos com desconto ao agendar junto com manicure.',
    active: true,
  },
  {
    id: 'aviso_horarios',
    kind: 'aviso',
    title: 'Horários disputados',
    description: 'Se o horário estiver ocupado, entre na lista de espera para ser avisada.',
    active: true,
  },
];
