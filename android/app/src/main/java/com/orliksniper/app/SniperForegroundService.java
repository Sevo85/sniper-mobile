package com.orliksniper.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * SniperForegroundService — Keeps the app alive during sniping operations.
 * This prevents Android from killing the process when the screen is off.
 */
public class SniperForegroundService extends Service {
    private static final String TAG = "SniperService";
    private static final String CHANNEL_ID = "SniperForegroundChannel";
    private static final int NOTIFICATION_ID = 999;

    private PowerManager.WakeLock serviceWakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // Acquire our own WakeLock immediately to keep CPU alive
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            serviceWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sniper:ServiceWakeLock");
            serviceWakeLock.acquire(5 * 60 * 1000L); // 5 minutes
            Log.i(TAG, "Service WakeLock acquired");
            
            // Explicitly force the screen ON! This is critical for WebView JS execution when locked.
            try {
                @SuppressWarnings("deprecation")
                PowerManager.WakeLock screenWakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "Sniper:ScreenWakeUp"
                );
                screenWakeLock.acquire(60 * 1000L); // Turn screen on for 60 seconds
                Log.i(TAG, "Screen WakeLock acquired (forced screen wake up)");
            } catch (Exception e) {
                Log.e(TAG, "Failed to acquire screen wake lock", e);
            }
        }

        // Release the static WakeLock from AlarmReceiver — we have our own now
        SniperAlarmReceiver.releaseStaticWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if ("STOP".equals(action)) {
            Log.i(TAG, "Stopping foreground service");
            releaseServiceWakeLock();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        Log.i(TAG, "Starting foreground service with action: " + action);

        // Build the notification with full-screen intent for maximum wake-up priority
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        
        // Pack extras into notification intent in case OS launches it via full-screen intent
        if ("START_SNIPER".equals(action) && intent != null) {
            notificationIntent.putExtra("auto_snipe", true);
            notificationIntent.putExtra("chatUrl", intent.getStringExtra("chatUrl"));
            notificationIntent.putExtra("targetTime", intent.getStringExtra("targetTime"));
            notificationIntent.putExtra("strategy", intent.getStringExtra("strategy"));
            notificationIntent.putExtra("messengerPin", intent.getStringExtra("messengerPin"));
        }
        
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Orlik Sniper Aktywny")
                .setContentText("Przygotowuję się do strzału...")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true) // Full-screen intent turns on screen
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setOngoing(true)
                .build();

        startForeground(NOTIFICATION_ID, notification);

        if ("START_SNIPER".equals(action) && intent != null) {
            String chatUrl = intent.getStringExtra("chatUrl");
            String targetTime = intent.getStringExtra("targetTime");
            String strategy = intent.getStringExtra("strategy");
            String messengerPin = intent.getStringExtra("messengerPin");

            Log.i(TAG, "Triggering sniper workflow from service...");
            SniperWebViewPlugin.logNative("Próba uruchomienia snajpera z usługi...", "info");
            
            SniperWebViewPlugin plugin = SniperWebViewPlugin.getInstance();
            boolean pluginAlive = (plugin != null);
            
            if (pluginAlive) {
                Log.i(TAG, "Plugin exists, triggering workflow directly from Service");
                plugin.triggerWorkflowNative(chatUrl, targetTime, strategy, messengerPin);
            } else {
                Log.w(TAG, "Plugin is NULL (app was killed). Relying on MainActivity to initialize.");
            }

            // ALWAYS launch MainActivity to ensure the screen turns on (if allowed)
            Intent launchIntent = new Intent(this, MainActivity.class);
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
            
            // Only tell MainActivity to trigger the workflow if we didn't do it here
            if (!pluginAlive) {
                launchIntent.putExtra("auto_snipe", true);
                launchIntent.putExtra("chatUrl", chatUrl);
                launchIntent.putExtra("targetTime", targetTime);
                launchIntent.putExtra("strategy", strategy);
                launchIntent.putExtra("messengerPin", messengerPin);
            }

            try {
                startActivity(launchIntent);
                SniperWebViewPlugin.logNative("Budzę aplikację (MainActivity)...", "info");
            } catch (Exception e) {
                Log.e(TAG, "Failed to start MainActivity from background", e);
                SniperWebViewPlugin.logNative("BŁĄD: Nie udało się uruchomić Activity: " + e.getMessage(), "error");
            }
        }

        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        releaseServiceWakeLock();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void releaseServiceWakeLock() {
        if (serviceWakeLock != null && serviceWakeLock.isHeld()) {
            try {
                serviceWakeLock.release();
                Log.i(TAG, "Service WakeLock released");
            } catch (Exception e) {
                Log.w(TAG, "Error releasing service WakeLock", e);
            }
        }
        serviceWakeLock = null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Sniper Service Channel",
                    NotificationManager.IMPORTANCE_HIGH // HIGH for full-screen intent support
            );
            serviceChannel.setDescription("Keeps the sniper active in background");
            serviceChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }
}
