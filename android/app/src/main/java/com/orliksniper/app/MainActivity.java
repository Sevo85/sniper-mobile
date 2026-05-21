package com.orliksniper.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SniperWebView";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom plugins before bridge initialization
        registerPlugin(SniperWebViewPlugin.class);
        super.onCreate(savedInstanceState);

        // Allow showing on lock screen (for background wake-up)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }

        // Handle auto_snipe intent from ForegroundService when app was killed
        handleAutoSnipeIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        // Handle auto_snipe intent when Activity already exists
        handleAutoSnipeIntent(intent);
    }

    /**
     * Centralized handler for auto_snipe intents.
     * Works for both fresh launch (onCreate) and redelivery (onNewIntent).
     */
    private void handleAutoSnipeIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("auto_snipe", false)) {
            return;
        }

        Log.i(TAG, "Auto-snipe detected, waiting for plugin initialization...");
        String chatUrl = intent.getStringExtra("chatUrl");
        String targetTime = intent.getStringExtra("targetTime");
        String strategy = intent.getStringExtra("strategy");
        String messengerPin = intent.getStringExtra("messengerPin");

        // Keep the screen ON while the sniper is preparing and waiting for the target time.
        // This prevents the OS from suspending the WebView and JS timers.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Clear the flag so we don't re-trigger on config change
        intent.removeExtra("auto_snipe");

        // Post with delay to ensure Capacitor bridge and plugin are fully initialized
        getWindow().getDecorView().postDelayed(() -> {
            SniperWebViewPlugin plugin = SniperWebViewPlugin.getInstance();
            if (plugin != null) {
                Log.i(TAG, "Plugin ready, triggering native workflow");
                plugin.triggerWorkflowNative(chatUrl, targetTime, strategy, messengerPin);
            } else {
                Log.e(TAG, "Plugin still NULL after delay! Cannot trigger workflow.");
            }
        }, 2000); // 2s delay for bridge init
    }
}
