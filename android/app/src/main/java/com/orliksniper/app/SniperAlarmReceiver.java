package com.orliksniper.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

/**
 * SniperAlarmReceiver — Receives the signal from Android AlarmManager.
 * This runs even if the app is closed/killed.
 *
 * Uses a static WakeLock to prevent GC from releasing it before
 * the ForegroundService has a chance to start.
 */
public class SniperAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "SniperAlarm";

    // Static WakeLock — survives beyond onReceive() scope
    private static PowerManager.WakeLock sWakeLock;
    private static final Object LOCK = new Object();

    /**
     * Acquire a static WakeLock that survives GC.
     * Must be released explicitly via releaseStaticWakeLock().
     */
    static void acquireStaticWakeLock(Context context) {
        synchronized (LOCK) {
            if (sWakeLock != null && sWakeLock.isHeld()) {
                return; // Already held
            }
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                sWakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "Sniper:AlarmWakeup"
                );
                sWakeLock.acquire(60 * 1000L); // 60 seconds — enough for service to start and take over
                Log.i(TAG, "Static WakeLock acquired (60s timeout)");
            }
        }
    }

    /**
     * Release the static WakeLock (called by ForegroundService after it has its own WakeLock).
     */
    static void releaseStaticWakeLock() {
        synchronized (LOCK) {
            if (sWakeLock != null && sWakeLock.isHeld()) {
                try {
                    sWakeLock.release();
                    Log.i(TAG, "Static WakeLock released");
                } catch (Exception e) {
                    Log.w(TAG, "Error releasing static WakeLock", e);
                }
            }
            sWakeLock = null;
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        // Use goAsync() to extend the BroadcastReceiver lifetime beyond the default 10s
        final PendingResult pendingResult = goAsync();

        SniperWebViewPlugin.logNative("Otrzymano sygnał pobudki z systemowego budzika!", "warn");
        Log.i(TAG, "Native Alarm Received! Starting Foreground Service...");

        // Acquire a STATIC wake lock — won't be GC'd
        acquireStaticWakeLock(context);

        Intent serviceIntent = new Intent(context, SniperForegroundService.class);
        serviceIntent.setAction("START_SNIPER");

        // Pass the metadata from the alarm to the service
        serviceIntent.putExtra("chatUrl", intent.getStringExtra("chatUrl"));
        serviceIntent.putExtra("targetTime", intent.getStringExtra("targetTime"));
        serviceIntent.putExtra("strategy", intent.getStringExtra("strategy"));
        serviceIntent.putExtra("messengerPin", intent.getStringExtra("messengerPin"));
        serviceIntent.putExtra("wakeScreen", intent.getBooleanExtra("wakeScreen", true));

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            Log.i(TAG, "ForegroundService start requested successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start ForegroundService", e);
            releaseStaticWakeLock();
        }

        // Finish the async broadcast
        pendingResult.finish();
    }
}
