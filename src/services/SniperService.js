/**
 * SniperService — Core sniping logic for Messenger number incrementing.
 * Designed for injection into WebView running messenger.com.
 *
 * Strategies:
 * - "fixed": Always sends "+1"
 * - "dynamic": Finds the last number in chat and sends lastNumber + 1
 */

// The JS code that will be injected into WebView/iframe
const MONITOR_SCRIPT = `
(function() {
  'use strict';

  // Prevent double-injection
  if (window.__SNIPER_ACTIVE__) return;
  window.__SNIPER_ACTIVE__ = true;
  window.__SNIPER_STATE__ = {
    lastNumber: null,
    fired: false,
    logs: [],
    status: 'monitoring'
  };

  function log(msg, level) {
    const entry = {
      time: new Date().toISOString(),
      text: msg,
      level: level || 'info'
    };
    window.__SNIPER_STATE__.logs.push(entry);
    console.log('[Sniper] ' + msg);
  }

  function isGameMessage(text, el) {
    var t = text.trim();
    if (t.length === 0 || t.length > 200) return false;

    // Skip if the element or any of its parents is a heading (Messenger date headers)
    if (el) {
      var curr = el;
      while (curr && curr !== document.body) {
        var tag = curr.tagName;
        if (tag === 'H3' || tag === 'H4' || tag === 'H5' || curr.getAttribute('role') === 'heading') {
          return false;
        }
        curr = curr.parentElement;
      }
    }

    var lower = t.toLowerCase();

    // Skip if it contains a time pattern (e.g. "10:12" or "10:12:35" or "10:12 am")
    if (/\b\d{1,2}:\d{2}(:\d{2})?(\s*[ap]m)?\b/i.test(t)) return false;

    // Skip if it contains a numeric date pattern (e.g. "11.05.2026" or "11/05/26" or "11.05")
    if (/\b\d{1,2}[\.\/]\d{1,2}([\.\/]\d{2,4})?\b/.test(t)) return false;

    // Skip if it contains date words, month names, relative day names, status indicators or system messages
    var nonGameWords = [
      'styczeń', 'stycznia', 'sty', 'luty', 'lutego', 'lut', 'marzec', 'marca', 'mar',
      'kwiecień', 'kwietnia', 'kwi', 'maj', 'maja', 'czerwiec', 'czerwca', 'cze',
      'lipiec', 'lipca', 'lip', 'sierpień', 'sierpnia', 'sie', 'wrzesień', 'września', 'wrz',
      'październik', 'października', 'paź', 'listopad', 'listopada', 'lis', 'grudzień', 'grudnia', 'gru',
      'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela', 'pon', 'wt', 'śr', 'czw', 'pią', 'sob', 'nie',
      'january', 'jan', 'february', 'feb', 'march', 'april', 'apr', 'may', 'june', 'jun',
      'july', 'jul', 'august', 'aug', 'september', 'sep', 'october', 'oct', 'november', 'nov', 'december', 'dec',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
      'today', 'yesterday', 'dzisiaj', 'wczoraj', 'wysłano', 'seen', 'sent', 'delivered', 'dostarczono', 'wyświetlono', 'aktywny', 'aktywna', 'active', 'temu', 'ago',
      'dodał', 'dodała', 'usunął', 'usunęła', 'opuścił', 'opuściła', 'dołączył', 'dołączyła', 'zmienił', 'zmieniła', 'nazwę', 'konwersację', 'szyfrowanie', 'szyfrowane', 'zablokował', 'zablokowała', 'polubił', 'polubiła', 'like', 'kciuk',
      'added', 'removed', 'joined', 'left', 'changed', 'name', 'conversation', 'encrypted', 'blocked', 'liked'
    ];

    // Split by non-alphanumeric / non-Polish characters to avoid word boundary issues with Unicode
    var tokens = lower.split(/[^a-z0-9ąęćłńóśźż]+/);
    for (var i = 0; i < tokens.length; i++) {
      if (nonGameWords.indexOf(tokens[i]) !== -1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Scan chat messages for the last number.
   * Looks for message bubbles containing standalone numbers.
   */
  function findLastNumber() {
    var chatMain = document.querySelector('[role="main"]');
    if (!chatMain) return null;
    
    // Szukamy wiadomości wyłącznie w elementach tekstowych (dymkach)
    var messages = chatMain.querySelectorAll('[dir="auto"]');
    var recentNumbers = [];
    var msgCount = 0;
    
    // Sprawdzamy do 15 ostatnich wiadomości
    for (var i = messages.length - 1; i >= 0 && msgCount < 15; i--) {
      var text = messages[i].textContent.trim();
      
      // Pomiń bardzo długie teksty (to raczej nie jest numeracja)
      if (text.length > 200 || text.length === 0) continue;
      
      // Check if it is a valid game message (filter out timestamps, date headers, user names, etc.)
      if (!isGameMessage(text, messages[i])) continue;
      
      msgCount++;
      
      // Match: standalone number or "+1" pattern
      var matches = text.match(/(?:^|[\n\s,\-])(\d+)(?=[\.\s\-]|$)/g);
      if (matches) {
        matches.forEach(m => {
          if (text.includes(':')) {
            var idx = text.indexOf(m);
            if (idx > 0 && text[idx-1] === ':') return;
            if (idx + m.length < text.length && text[idx+m.length] === ':') return;
          }
          
          var num = parseInt(m.match(/\d+/)[0], 10);
          
          // Sensowne limity dla zapisów sportowych (zapobiega braniu "100" z "100%")
          if (num >= 1 && num <= 60) {
            recentNumbers.push(num);
          }
        });
      }
    }
    
    if (recentNumbers.length > 0) {
      return Math.max(...recentNumbers);
    }
    return null;
  }

  /**
   * Type a message into Messenger's input field and send it.
   * Optimized for speed — targets the contenteditable input directly.
   */
  function sendMessage(text) {
    // Find the message input
    const inputSelectors = [
      '[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][aria-label]',
      'p[contenteditable="true"]'
    ];

    let input = null;
    for (const selector of inputSelectors) {
      input = document.querySelector(selector);
      if (input) break;
    }

    if (!input) {
      log('ERROR: Message input not found!', 'error');
      return false;
    }

    // Focus the input
    input.focus();

    // Clear any existing text thoroughly
    input.innerHTML = '';
    input.textContent = '';
    input.innerText = '';

    // Use execCommand for compatibility with React-controlled inputs
    document.execCommand('insertText', false, text);

    // Also dispatch input event for React
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // Find and click the send button, or press Enter
    const sendBtn = document.querySelector(
      '[aria-label="Send"], [aria-label="Wyślij"], [data-testid="send-button"]'
    );

    if (sendBtn) {
      sendBtn.click();
    } else {
      // Fallback: press Enter
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true
      }));
    }

    return true;
  }

  /**
   * Main monitoring loop using MutationObserver.
   * Watches for new messages and keeps track of the latest number.
   */
  const observer = new MutationObserver(function(mutations) {
    if (window.__SNIPER_STATE__.fired) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          const lastNum = findLastNumber();
          if (lastNum !== null && lastNum !== window.__SNIPER_STATE__.lastNumber) {
            window.__SNIPER_STATE__.lastNumber = lastNum;
            log('Detected number: ' + lastNum, 'info');
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan
  const initialNum = findLastNumber();
  if (initialNum !== null) {
    window.__SNIPER_STATE__.lastNumber = initialNum;
    log('Initial scan: last number is ' + initialNum, 'info');
  } else {
    log('Initial scan: no numbers found yet', 'warn');
  }

  // Expose fire function for external triggering
  window.__SNIPER_FIRE__ = function(strategy) {
    if (window.__SNIPER_STATE__.fired) {
      log('Already fired — ignoring duplicate call', 'warn');
      return false;
    }

    const start = performance.now();
    let messageToSend;

    if (strategy === 'fixed') {
      messageToSend = '+1';
      log('Strategy: Fixed +1', 'info');
    } else {
      // Dynamic: find last number NOW (fresh scan) and add 1
      const freshNum = findLastNumber();
      if (freshNum !== null) {
        messageToSend = String(freshNum + 1);
        log('Strategy: Dynamic — found ' + freshNum + ', sending ' + messageToSend, 'info');
      } else {
        messageToSend = '+1';
        log('Strategy: Dynamic — no number found, fallback to +1', 'warn');
      }
    }

    const success = sendMessage(messageToSend);
    const elapsed = (performance.now() - start).toFixed(1);

    if (success) {
      window.__SNIPER_STATE__.fired = true;
      window.__SNIPER_STATE__.status = 'success';
      log('FIRE SUCCESS! Sent "' + messageToSend + '" in ' + elapsed + 'ms', 'success');
    } else {
      window.__SNIPER_STATE__.status = 'error';
      log('FIRE FAILED — could not send message', 'error');
    }

    return success;
  };

  // Expose scan function for the app to poll
  window.__SNIPER_SCAN__ = findLastNumber;

  log('Sniper monitor injected and active', 'success');
})();
`;

/**
 * SniperService class — manages the sniping lifecycle
 */
class SniperService {
  constructor() {
    this.strategy = 'dynamic'; // 'fixed' or 'dynamic'
    this.targetTime = null;
    this.chatUrl = '';
    this.status = 'idle'; // idle, waiting, armed, firing, success, error
    this.logs = [];
    this.listeners = new Set();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
  }

  _log(text, level = 'info') {
    const entry = {
      id: Date.now() + Math.random(),
      time: new Date(),
      text,
      level,
    };
    this.logs = [...this.logs, entry].slice(-100); // Keep last 100 logs
    this._notify();
  }

  getState() {
    return {
      status: this.status,
      strategy: this.strategy,
      targetTime: this.targetTime,
      chatUrl: this.chatUrl,
      logs: this.logs,
    };
  }

  configure({ strategy, targetTime, chatUrl }) {
    if (strategy) this.strategy = strategy;
    if (targetTime) this.targetTime = new Date(targetTime);
    if (chatUrl) this.chatUrl = chatUrl;
    this._log(`Configured: strategy=${this.strategy}, target=${this.targetTime?.toLocaleString() || 'none'}`);
    this._notify();
  }

  /**
   * Get the JS code to inject into the WebView
   */
  getMonitorScript() {
    return MONITOR_SCRIPT;
  }

  /**
   * Get the fire command to execute in WebView
   */
  getFireCommand() {
    return `window.__SNIPER_FIRE__('${this.strategy}')`;
  }

  /**
   * Get the scan command for polling last number
   */
  getScanCommand() {
    return `window.__SNIPER_SCAN__()`;
  }

  /**
   * Get state polling command
   */
  getStateCommand() {
    return `JSON.stringify(window.__SNIPER_STATE__ || {})`;
  }

  setStatus(status) {
    this.status = status;
    this._log(`Status changed: ${status}`, status === 'error' ? 'error' : status === 'success' ? 'success' : 'info');
    this._notify();
  }

  arm() {
    if (!this.targetTime) {
      this._log('Cannot arm: no target time set', 'error');
      return false;
    }
    if (!this.chatUrl) {
      this._log('Cannot arm: no chat URL set', 'error');
      return false;
    }
    this.setStatus('armed');
    this._log(`🎯 Sniper armed! Target: ${this.targetTime.toLocaleString()}`, 'success');
    return true;
  }

  disarm() {
    this.setStatus('idle');
    this._log('Sniper disarmed', 'warn');
  }

  /**
   * Calculate time remaining until target
   */
  getTimeRemaining() {
    if (!this.targetTime) return null;
    const diff = this.targetTime.getTime() - Date.now();
    if (diff <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

    return {
      total: diff,
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  }

  /**
   * Format a Messenger chat URL or ID into a valid URL
   */
  static formatChatUrl(input) {
    if (!input) return '';
    input = input.trim();

    // Already a full URL
    if (input.startsWith('http')) return input;

    // Numeric chat ID
    if (/^\d+$/.test(input)) {
      return `https://www.messenger.com/t/${input}`;
    }

    // Username or short form
    return `https://www.messenger.com/t/${input}`;
  }
}

// Singleton instance
const sniperService = new SniperService();
export default sniperService;
export { SniperService, MONITOR_SCRIPT };
