package com.orliksniper.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * BootCompletedReceiver — Re-launches the app after device reboot.
 * 
 * This triggers MainActivity so that the Capacitor bridge can reinitialize
 * and the JS layer can re-schedule any saved alarms from StorageService.
 */
public class BootCompletedReceiver extends BroadcastReceiver {
    private static final String TAG = "SniperBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            
            Log.i(TAG, "Device booted or app updated. Launching app to re-schedule alarms...");

            // Launch MainActivity so Capacitor bridge initializes
            // and the JS layer can re-read saved schedules and re-arm
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            launchIntent.putExtra("boot_reschedule", true);

            try {
                context.startActivity(launchIntent);
                Log.i(TAG, "MainActivity launched for re-scheduling");
            } catch (Exception e) {
                Log.e(TAG, "Failed to launch MainActivity after boot", e);
            }
        }
    }
}
