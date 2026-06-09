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
        }

        // Release the static WakeLock from AlarmReceiver — we have our own now
        SniperAlarmReceiver.releaseStaticWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        boolean wakeScreen = intent == null || intent.getBooleanExtra("wakeScreen", true);

        if ("STOP".equals(action)) {
            Log.i(TAG, "Stopping foreground service");
            releaseServiceWakeLock();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        Log.i(TAG, "Starting foreground service with action: " + action + ", wakeScreen: " + wakeScreen);

        if (wakeScreen) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
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
        }

        // Build the notification with full-screen intent for maximum wake-up priority if wakeScreen is enabled
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        
        // Pack extras into notification intent in case OS launches it via full-screen intent
        if ("START_SNIPER".equals(action) && intent != null) {
            notificationIntent.putExtra("auto_snipe", true);
            notificationIntent.putExtra("chatUrl", intent.getStringExtra("chatUrl"));
            notificationIntent.putExtra("targetTime", intent.getStringExtra("targetTime"));
            notificationIntent.putExtra("strategy", intent.getStringExtra("strategy"));
            notificationIntent.putExtra("messengerPin", intent.getStringExtra("messengerPin"));
            notificationIntent.putExtra("wakeScreen", wakeScreen);
        }
        
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder notificationBuilder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Orlik Sniper Aktywny")
                .setContentText("Przygotowuję się do strzału...")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setOngoing(true);

        if (wakeScreen) {
            notificationBuilder.setFullScreenIntent(pendingIntent, true); // Full-screen intent turns on screen
        }

        Notification notification = notificationBuilder.build();
        startForeground(NOTIFICATION_ID, notification);

        if ("START_SNIPER".equals(action) && intent != null) {
            String chatUrl = intent.getStringExtra("chatUrl");
            String targetTime = intent.getStringExtra("targetTime");
            String strategy = intent.getStringExtra("strategy");
            String messengerPin = intent.getStringExtra("messengerPin");

            Log.i(TAG, "Triggering sniper workflow from service via MainActivity...");
            SniperWebViewPlugin.logNative("Przygotowywanie aktywności snajpera...", "info");
            
            // Launch MainActivity to ensure the screen/window is created and resumed.
            // This is required because Android freezes WebViews attached to stopped activities.
            // By calling setShowWhenLocked(true) and setTurnScreenOn(false), the activity
            // will resume behind the lockscreen without waking up the screen.
            Intent launchIntent = new Intent(this, MainActivity.class);
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
            
            launchIntent.putExtra("auto_snipe", true);
            launchIntent.putExtra("chatUrl", chatUrl);
            launchIntent.putExtra("targetTime", targetTime);
            launchIntent.putExtra("strategy", strategy);
            launchIntent.putExtra("messengerPin", messengerPin);
            launchIntent.putExtra("wakeScreen", wakeScreen);

            try {
                startActivity(launchIntent);
                SniperWebViewPlugin.logNative("Budzę aplikację w tle (MainActivity)...", "info");
            } catch (Exception e) {
                Log.e(TAG, "Failed to start MainActivity from background", e);
                SniperWebViewPlugin.logNative("BŁĄD: Nie udało się uruchomić Activity: " + e.getMessage(), "error");
                
                // Fallback: If starting activity fails (e.g. background activity restrictions),
                // try to run directly if plugin is alive.
                SniperWebViewPlugin plugin = SniperWebViewPlugin.getInstance();
                if (plugin != null) {
                    Log.w(TAG, "Fallback: triggering workflow directly from Service");
                    plugin.triggerWorkflowNative(chatUrl, targetTime, strategy, messengerPin);
                }
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
