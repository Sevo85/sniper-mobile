/**
 * SniperWebViewBridge — JavaScript wrapper for the native SniperWebView Capacitor plugin.
 *
 * This module provides a clean API for the React layer to interact with the
 * native Android WebView that runs messenger.com.
 *
 * Usage:
 *   import webViewBridge from './SniperWebViewBridge';
 *   await webViewBridge.openForLogin();
 *   await webViewBridge.navigateToChat('123456789');
 *   await webViewBridge.injectSniper('dynamic');
 *   await webViewBridge.fire('dynamic');
 */
import { registerPlugin } from '@capacitor/core';

// Register the native plugin — maps to Java SniperWebViewPlugin
const SniperWebView = registerPlugin('SniperWebView');

class SniperWebViewBridge {
  constructor() {
    this.isNative = typeof window !== 'undefined' &&
      window.Capacitor !== undefined &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform();

    this.eventListeners = new Map();
  }

  // ============================
  // WebView Lifecycle
  // ============================

  /**
   * Open WebView for manual login (visible overlay).
   * User will see messenger.com and can log in manually.
   */
  async openForLogin() {
    if (!this.isNative) {
      console.log('[Bridge] Dev mode: simulating login WebView');
      return { success: true, url: 'https://www.messenger.com/', visible: true };
    }
    return await SniperWebView.open({
      url: 'https://www.messenger.com/login/',
      visible: true,
    });
  }

  /**
   * Open WebView hidden (for automated sniping).
   * @param {string} chatUrl - Full Messenger chat URL
   */
  async openHidden(chatUrl) {
    if (!this.isNative) {
      console.log('[Bridge] Dev mode: simulating hidden WebView for', chatUrl);
      return { success: true, url: chatUrl, visible: false };
    }
    return await SniperWebView.open({
      url: chatUrl,
      visible: false,
    });
  }

  /**
   * Navigate to a specific chat.
   * @param {string} chatIdOrUrl - Chat ID or full URL
   */
  async navigateToChat(chatIdOrUrl) {
    const url = this._formatChatUrl(chatIdOrUrl);
    if (!this.isNative) {
      console.log('[Bridge] Dev mode: would navigate to', url);
      return { success: true, url };
    }
    return await SniperWebView.navigate({ url });
  }

  /**
   * Show the WebView overlay.
   */
  async show() {
    if (!this.isNative) return { visible: true };
    return await SniperWebView.setVisible({ visible: true });
  }

  /**
   * Hide the WebView overlay (keeps it running in background).
   */
  async hide() {
    if (!this.isNative) return { visible: false };
    return await SniperWebView.setVisible({ visible: false });
  }

  /**
   * Close and destroy the WebView.
   */
  async close() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.close();
  }

  // ============================
  // JavaScript Injection
  // ============================

  /**
   * Execute arbitrary JavaScript in the WebView.
   * @param {string} script - JS code to execute
   * @returns {Promise<string>} - Result of the evaluation
   */
  async executeScript(script) {
    if (!this.isNative) {
      console.log('[Bridge] Dev mode: would execute script:', script.substring(0, 80) + '...');
      return { result: 'null' };
    }
    return await SniperWebView.executeScript({ script });
  }

  /**
   * Inject the sniper monitoring script into the loaded Messenger page.
   * @param {string} strategy - 'fixed' or 'dynamic'
   */
  async injectSniper(strategy = 'dynamic') {
    if (!this.isNative) {
      console.log('[Bridge] Dev mode: would inject sniper with strategy:', strategy);
      return { success: true, strategy };
    }
    return await SniperWebView.injectSniper({ strategy });
  }

  /**
   * Fire the sniper — find the last number and send +1.
   * @param {string} strategy - 'fixed' or 'dynamic'
   */
  async fire(strategy = 'dynamic') {
    if (!this.isNative) {
      console.log('[Bridge] Dev mode: would fire sniper with strategy:', strategy);
      return { success: true, result: 'simulated' };
    }
    return await SniperWebView.fire({ strategy });
  }

  /**
   * Get the current sniper state from the injected script.
   */
  async getSniperState() {
    if (!this.isNative) {
      return { state: '{"lastNumber":null,"fired":false,"status":"monitoring"}' };
    }
    return await SniperWebView.getSniperState();
  }

  // ============================
  // Background / WakeLock
  // ============================

  /**
   * Acquire a native WakeLock to prevent the device from sleeping.
   */
  async acquireWakeLock() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.acquireWakeLock();
  }

  /**
   * Release the native WakeLock.
   */
  async releaseWakeLock() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.releaseWakeLock();
  }

  /**
   * Start the foreground service.
   */
  async startForegroundService() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.startForegroundService();
  }

  /**
   * Stop the foreground service.
   */
  async stopForegroundService() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.stopForegroundService();
  }

  // ============================
  // Native Alarms (Exact Wake-up)
  // ============================

  /**
   * Schedule a high-priority system alarm that wakes the device.
   * @param {Object} options
   * @param {string} options.targetTime - ISO string or timestamp
   * @param {string} options.chatUrl - Chat to open when triggered
   * @param {string} options.strategy - Sniper strategy
   * @param {string} options.messengerPin - Optional PIN
   */
  async scheduleNativeAlarm({ targetTime, chatUrl, strategy, messengerPin, wakeScreen }) {
    if (!this.isNative) {
      console.log('[Bridge] Dev mode: simulated native alarm for', targetTime);
      return { success: true };
    }
    return await SniperWebView.scheduleNativeAlarm({
      targetTime: targetTime instanceof Date ? targetTime.toISOString() : targetTime,
      chatUrl: this._formatChatUrl(chatUrl),
      strategy,
      messengerPin: messengerPin || '',
      wakeScreen: wakeScreen !== false
    });
  }

  /**
   * Cancel any pending native alarm.
   */
  async cancelNativeAlarm() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.cancelNativeAlarm();
  }
  /**
   * Check if the app has necessary background permissions.
   * @returns {Promise<{exactAlarm: boolean, batteryExempt: boolean}>}
   */
  async checkPermissions() {
    if (!this.isNative) return { exactAlarm: true, batteryExempt: true };
    return await SniperWebView.checkPermissions();
  }

  /**
   * Open system settings to request necessary background permissions.
   */
  async requestPermissions() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.requestPermissions();
  }

  // ============================
  // Session / Cookies
  // ============================

  /**
   * Check if user has an active Facebook session.
   * Looks for the c_user cookie which indicates a logged-in state.
   */
  async hasSession() {
    if (!this.isNative) {
      console.log('[Bridge] Dev mode: checking session');
      return false;
    }
    const result = await SniperWebView.getCookies({
      url: 'https://www.messenger.com',
    });
    return result.hasSession;
  }

  /**
   * Get current cookies.
   */
  async getCookies() {
    if (!this.isNative) return { cookies: '', hasSession: false };
    return await SniperWebView.getCookies({
      url: 'https://www.messenger.com',
    });
  }

  /**
   * Persist cookies to disk (call after successful login).
   */
  async persistCookies() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.persistCookies();
  }

  /**
   * Clear all cookies (logout).
   */
  async clearSession() {
    if (!this.isNative) return { success: true };
    return await SniperWebView.clearCookies();
  }

  /**
   * Get full WebView state.
   */
  async getState() {
    if (!this.isNative) {
      return {
        isOpen: false,
        isVisible: false,
        isPageLoaded: false,
        currentUrl: '',
        hasSession: false,
      };
    }
    return await SniperWebView.getState();
  }

  // ============================
  // Events
  // ============================

  /**
   * Listen for WebView events (pageStarted, pageFinished, progress, etc.)
   * @param {Function} callback - Called with event data
   * @returns {Function} - Unsubscribe function
   */
  onWebViewEvent(callback) {
    if (!this.isNative) return () => {};
    const handle = SniperWebView.addListener('webViewEvent', callback);
    return () => handle.remove();
  }

  /**
   * Listen for sniper events (numberDetected, messageSent, log)
   * @param {Function} callback - Called with event data
   * @returns {Function} - Unsubscribe function
   */
  onSniperEvent(callback) {
    if (!this.isNative) return () => {};
    const handle = SniperWebView.addListener('sniperEvent', callback);
    return () => handle.remove();
  }

  // ============================
  // Helpers
  // ============================

  /**
   * Format a chat ID or URL into a valid Messenger URL.
   */
  _formatChatUrl(input) {
    if (!input) return 'https://www.messenger.com/';
    input = input.trim();
    if (input.startsWith('http')) {
      return input.replace('m.messenger.com', 'www.messenger.com');
    }
    return `https://www.messenger.com/t/${input}`;
  }

  /**
   * Full sniper workflow:
   * 1. Open hidden WebView with chat URL
   * 2. Wait for page load
   * 3. Inject monitor script
   * 4. Wait until target time
   * 5. Fire
   *
   * @param {Object} options
   * @param {string} options.chatUrl - Chat URL or ID
   * @param {Date} options.targetTime - When to fire
   * @param {string} options.strategy - 'fixed' or 'dynamic'
   * @param {string} options.messengerPin - Messenger PIN (E2EE)
   * @param {Function} options.onLog - Log callback
   */
  async runSniperWorkflow({ chatUrl, targetTime, strategy, messengerPin, onLog, visible }) {
    const log = (msg, level) => {
      console.log(`[Sniper] ${msg}`);
      if (onLog) onLog(msg, level || 'info');
    };

    try {
      // Ensure the device stays awake via WakeLock AND Foreground Service
      await this.acquireWakeLock();
      await this.startForegroundService();
      log('Budzenie systemowe aktywne (WakeLock + Foreground Service)', 'info');

      const targetUrl = this._formatChatUrl(chatUrl);
      log('Otwieram Messenger...', 'info');

      // Step 1: Open WebView (initially loads Messenger — may land on chat list)
      await SniperWebView.open({
        url: targetUrl,
        visible: visible !== false,
      });

      // Step 2: Wait for initial page load
      log('Czekam na załadowanie strony...', 'info');
      if (this.isNative) {
        await new Promise((resolve) => {
          const unsub = this.onWebViewEvent((event) => {
            if (event.event === 'pageFinished') {
              unsub();
              resolve();
            }
          });
          setTimeout(() => { unsub(); resolve(); }, 3000); // Reduced from 5s
        });
      }

      // Step 3: Single navigation to target chat
      log('Nawiguję do czatu...', 'info');
      await SniperWebView.navigate({ url: targetUrl });

      // Step 4: Wait for page load
      log('Czekam na załadowanie strony...', 'info');
      if (this.isNative) {
        await new Promise((resolve) => {
          const unsub = this.onWebViewEvent((event) => {
            if (event.event === 'pageFinished') {
              unsub();
              resolve();
            }
          });
          setTimeout(() => { unsub(); resolve(); }, 4000); // Reduced from 8s
        });
      }

      // Step 5: Ensure we are inside the chat
      log('Weryfikuję otwarcie czatu...', 'info');
      await SniperWebView.executeScript({
        script: `(function() {
          const targetName = "${targetUrl.includes('1639338547107148') ? 'Jan Kowalski' : ''}";
          if (!targetName) return;
          
          // Check if we are stuck on the list
          const isList = !!document.querySelector('[aria-label="Rozmowy"], [aria-label="Chats"]');
          const isChatOpen = !!document.querySelector('[role="main"] [aria-label="Wiadomość"]');
          
          if (isList && !isChatOpen) {
            const rows = Array.from(document.querySelectorAll('[role="row"], [role="gridcell"]'));
            const targetRow = rows.find(r => r.innerText.includes(targetName));
            if (targetRow) {
              targetRow.click();
              return "Clicked target row";
            }
          }
          return "Already in chat or target not found";
        })()`
      });

      await new Promise(r => setTimeout(r, 1000)); // Reduced from 3s

      // Step 6: Inject Fullscreen Chat CSS (DISABLED TO FIX BLACK SCREEN)
      /*
      log('Optymalizuję widok czatu...', 'info');
      await SniperWebView.executeScript({
        script: `(function() {
          const style = document.createElement('style');
          style.innerHTML = \`
            [role="navigation"], [role="banner"], aside { 
              display: none !important; 
            }
            [role="main"] {
              width: 100% !important;
              max-width: 100% !important;
              left: 0 !important;
              margin-left: 0 !important;
            }
          \`;
          document.head.appendChild(style);
          return 'css-injected';
        })();`
      });
      */

      // Step 7: Verify we're in a chat (look for textbox)
      log('Sprawdzam stan czatu...', 'info');
      const checkResult = await SniperWebView.executeScript({
        script: `(function() {
          var tb = document.querySelector('[role="textbox"]') || document.querySelector('[contenteditable="true"]');
          var main = document.querySelector('[role="main"]');
          var url = window.location.href;
          var isE2EE = url.includes('/e2ee/');
          
          if (window.AndroidSniper) {
            window.AndroidSniper.log('URL: ' + url, 'info');
            window.AndroidSniper.log('Tryb E2EE: ' + (isE2EE ? 'TAK' : 'NIE'), 'info');
            window.AndroidSniper.log('Main Area: ' + (main ? 'TAK' : 'NIE'), 'info');
            window.AndroidSniper.log('Textbox: ' + (tb ? 'TAK' : 'NIE'), 'info');
          }
          return tb ? 'ready' : 'no-textbox';
        })()`
      });

      // Step 7: Wait for input area to be ready
      log('Oczekuję na załadowanie czatu...', 'info');
      if (this.isNative) {
        let retries = 10;
        while (retries > 0) {
          const check = await SniperWebView.executeScript({
            script: `(function() {
              const input = document.querySelector('[role="textbox"][contenteditable="true"], div[contenteditable="true"][aria-label], p[contenteditable="true"]');
              const msgs = document.querySelectorAll('[dir="auto"]');
              return (input && msgs.length > 0) ? 'ready' : 'loading';
            })()`
          });
          if (check && check.result === 'ready') break;
          await new Promise(r => setTimeout(r, 1000));
          retries--;
        }
      } else {
        await new Promise(r => setTimeout(r, 2000));
      }

      // Step 8: Inject sniper monitor and arm
      log('Uzbrajam snajpera...', 'info');
      await SniperWebView.injectSniper({
        targetTime: targetTime,
        strategy: strategy,
        messengerPin: messengerPin || '',
      });

      log('Snajper gotowy i gotów do strzału!', 'success');
      return { success: true };
    } catch (err) {
      log(`Error: ${err.message}`, 'error');
      throw err;
    }
    // NOTE: WakeLock and ForegroundService are now released NATIVELY
    // from Java (SniperWebViewPlugin.onMessageSent) after the sniper fires.
    // JS setTimeout is unreliable when the app is in background.
  }
}

// Singleton
const webViewBridge = new SniperWebViewBridge();
export default webViewBridge;
export { SniperWebViewBridge };
