import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gabimanicure.app',
  appName: 'Gabi Manicure',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
      android: {
        channels: [
          {
            id: "gabi_manicure_channel_high_importance",
            name: "Notificações Gabi Manicure",
            description: "Notificações importantes do app Gabi Manicure",
            importance: 5, // IMPORTANCE_HIGH para heads-up notification
            sound: "default",
            vibration: true,
            visibility: 1 // VISIBILITY_PUBLIC
          }
        ]
      }
    }
  }
};

export default config;
