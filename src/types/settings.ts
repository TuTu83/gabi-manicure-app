export interface BusinessHours {
  openHour: number;
  closeHour: number;
}

export interface ThemeOverrides {
  primary?: string;
  primaryLight?: string;
  primaryDark?: string;
  accent?: string;
}

export interface AppSettings {
  appName: string;
  adminWhatsAppE164: string;
  businessHours: BusinessHours;
  workingDays: number[];
  notificationsEnabled: boolean;
  reminderMinutes: number;
  allowDarkMode: boolean;
  theme: ThemeOverrides;
  logoUrl?: string;
  bannerUrls?: string[];
  updatedAt: number;
}
