package com.gabimanicure.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String CHANNEL_ID = "gabi_manicure_channel_high_importance";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager == null) return;

            // Delete old channel if exists to reset settings
            notificationManager.deleteNotificationChannel(CHANNEL_ID);

            CharSequence name = "Notificações Gabi Manicure";
            String description = "Notificações importantes do app Gabi Manicure";
            int importance = NotificationManager.IMPORTANCE_HIGH;

            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.enableVibration(true);
            channel.enableLights(true);
            channel.setVibrationPattern(new long[]{0, 500, 200, 500});
            channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            channel.setShowBadge(true);
            channel.setBypassDnd(true);

            Uri soundUri = Settings.System.DEFAULT_NOTIFICATION_URI;
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                    .build();
            channel.setSound(soundUri, audioAttributes);

            notificationManager.createNotificationChannel(channel);
        }
    }
}
