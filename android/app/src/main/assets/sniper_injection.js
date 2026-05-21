(function() {
  'use strict';
  if (window.__SNIPER_ACTIVE__) return;
  window.__SNIPER_ACTIVE__ = true;
  window.__SNIPER_STATE__ = {
    lastNumber: null,
    fired: false,
    logs: [],
    status: 'monitoring'
  };

  function log(msg, level) {
    level = level || 'info';
    window.__SNIPER_STATE__.logs.push({
      time: new Date().toISOString(),
      text: msg,
      level: level
    });
    if (window.AndroidSniper) {
      window.AndroidSniper.log(msg, level);
    }
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

  function isPastDaySeparator(text) {
    var t = text.trim();
    var lower = t.toLowerCase();
    
    // A numeric date pattern (e.g. "11.05.2026" or "11/05" or "11.05") is a past day
    if (/\b\d{1,2}[\.\/]\d{1,2}([\.\/]\d{2,4})?\b/.test(t)) return true;
    
    var pastDayWords = [
      'styczeń', 'stycznia', 'sty', 'luty', 'lutego', 'lut', 'marzec', 'marca', 'mar',
      'kwiecień', 'kwietnia', 'kwi', 'maj', 'maja', 'czerwiec', 'czerwca', 'cze',
      'lipiec', 'lipca', 'lip', 'sierpień', 'sierpnia', 'sie', 'wrzesień', 'września', 'wrz',
      'październik', 'października', 'paź', 'listopad', 'listopada', 'lis', 'grudzień', 'grudnia', 'gru',
      'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela', 'pon', 'wt', 'śr', 'czw', 'pią', 'sob', 'nie',
      'january', 'jan', 'february', 'feb', 'march', 'april', 'apr', 'may', 'june', 'jun',
      'july', 'jul', 'august', 'aug', 'september', 'sep', 'october', 'oct', 'november', 'nov', 'december', 'dec',
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
      'yesterday', 'wczoraj'
    ];
    
    var tokens = lower.split(/[^a-z0-9ąęćłńóśźż]+/);
    for (var i = 0; i < tokens.length; i++) {
      if (pastDayWords.indexOf(tokens[i]) !== -1) {
        return true;
      }
    }
    
    return false;
  }

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
      
      // Stop scanning when hitting a past day separator to support weekly resets
      if (isPastDaySeparator(text)) {
        log('Koniec skanowania (starszy dzień/tydzień): "' + text + '"', 'info');
        break;
      }
      
      // Check if it is a valid game message (filter out timestamps, date headers, user names, etc.)
      if (!isGameMessage(text, messages[i])) continue;
      
      msgCount++;
      
      // Ignoruj wiadomości o płatnościach (często zawierają kwoty, które psują numerację)
      if (text.toLowerCase().match(/(blik|zł|pln|składka|kasa)/)) {
        continue;
      }
      
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
      // Wyciągamy najwyższy numer z ostatnich wiadomości (odporność na bałagan np. 14, 12, 13 -> zwróci 14)
      return Math.max(...recentNumbers);
    }
    return null;
  }

  function sendMessage(text, callback) {
    if (!text) { callback(false); return; }
    var startTime = Date.now();
    var checkInterval = setInterval(function() {
      var mainArea = document.querySelector('[role="main"]');
      if (!mainArea) return;
      
      // Find the input field — Messenger uses contenteditable div with role="textbox"
      var input = mainArea.querySelector('[role="textbox"][contenteditable="true"]') || 
                  mainArea.querySelector('[contenteditable="true"][aria-label]') ||
                  mainArea.querySelector('[contenteditable="true"]');
      
      if (input) {
        clearInterval(checkInterval);
        try {
          var inputDetails = input.tagName + ' (editable: ' + input.getAttribute('contenteditable') + ', role: ' + input.getAttribute('role') + ')';
          log('Znaleziono pole: ' + inputDetails, 'info');
          
          insertTextIntoEditor(input, text, mainArea, callback);
        } catch(e) {
          log('Błąd wysyłania: ' + e.message, 'error');
          callback(false);
        }
      } else if (Date.now() - startTime > 15000) {
        clearInterval(checkInterval);
        log('❌ Nie znaleziono pola po 15s', 'error');
        callback(false);
      }
    }, 200);
  }

  /**
   * Main text insertion orchestrator.
   * Uproszczona, pojedyncza strategia oparta na natywnym Paste lub ClipboardEvent.
   * Eliminuje to całkowicie wyścig (race condition) i problem wstawiania tekstu wielokrotnie (np. +1+1).
   */
  function insertTextIntoEditor(input, text, mainArea, callback) {
    input.focus();
    input.click();
    placeCursorAtEnd(input);
    

    function performJSFallback() {
      log('Używam sprawdzonych metod JS (execCommand + Paste)...', 'info');
      
      // Strategia 1: execCommand
      try {
        input.focus();
        placeCursorAtEnd(input);
        document.execCommand('insertText', false, text);
      } catch(e) {
        log('execCommand błąd: ' + e.message, 'warn');
      }
      
      // Sprawdzamy, czy się udało
      var currentText = (input.textContent || input.innerText || '').trim();
      if (currentText.includes(text)) {
        // Dodatkowe zdarzenie input dla Lexicala
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        return; 
      }
      
      // Strategia 2: ClipboardEvent
      log('execCommand nie weszło, próbuję ClipboardEvent...', 'info');
      try {
        input.focus();
        placeCursorAtEnd(input);
        var dt = new DataTransfer();
        dt.setData('text/plain', text);
        input.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt, bubbles: true, cancelable: true, composed: true
        }));
      } catch(e) {
        log('ClipboardEvent błąd: ' + e.message, 'warn');
      }
    }

    if (window.AndroidSniper && typeof window.AndroidSniper.typeText === 'function') {
      log('Wpisuję natywnie (IME commitText)...', 'info');
      window.AndroidSniper.typeText(text);
      
      setTimeout(function() {
        var currentText = (input.textContent || input.innerText || '').trim();
        if (!currentText.includes(text)) {
          log('Natywne wpisywanie nie przyniosło efektu, odpalam JS fallback...', 'warn');
          performJSFallback();
        }
        
        setTimeout(function() {
          clickSendOrEnter(input, mainArea, text, callback);
        }, 500);
      }, 500);
      
    } else {
      performJSFallback();
      setTimeout(function() {
        clickSendOrEnter(input, mainArea, text, callback);
      }, 500);
    }
  }

  /**
   * Place cursor at the end of a contenteditable element.
   */
  function placeCursorAtEnd(el) {
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e) { /* ignore */ }
  }

  /**
   * Find and click the Send button, or press Enter as fallback.
   */
  function clickSendOrEnter(input, mainArea, text, callback) {
    // SECURITY CHECK: Jeśli po 500ms tekstu nadal nie ma w polu, przerywamy wysyłanie!
    // Zapobiega to omyłkowemu wysłaniu "Like" (kciuka w górę).
    var currentText = (input.textContent || input.innerText || '').trim();
    if (!currentText.includes(text)) {
       log('❌ BŁĄD: Tekst nie wpisał się poprawnie (pole puste). Przerywam, żeby nie wysłać Like!', 'error');
       callback(false);
       return;
    }

    // Search for Send button — check multiple selectors
    var sendBtn = null;
    
    // Method 1: aria-label based search
    var allButtons = Array.from(mainArea.querySelectorAll('[role="button"], button'));
    sendBtn = allButtons.find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      // Skip "like" buttons explicitly
      if (label.includes('like') || label.includes('lubię') || label.includes('kciuk') || label.includes('thumb')) return false;
      // Match send buttons
      if (label.includes('send') || label.includes('wyślij') || label.includes('press enter')) return true;
      return false;
    });
    
    // Method 2: SVG-based send button (Messenger shows arrow icon when text is present)
    if (!sendBtn) {
      var svgButtons = mainArea.querySelectorAll('[role="button"]');
      for (var i = svgButtons.length - 1; i >= 0; i--) {
        var btn = svgButtons[i];
        // Send button typically appears after text is entered, and is near the input
        var svg = btn.querySelector('svg');
        if (svg && btn.closest('[role="main"]')) {
          var rect = btn.getBoundingClientRect();
          var inputRect = input.getBoundingClientRect();
          // Send button is usually to the right of or below the input
          if (rect.top >= inputRect.top - 50 && rect.left >= inputRect.right - 100) {
            var label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (!label.includes('like') && !label.includes('kciuk') && !label.includes('thumb') && !label.includes('lubię')) {
              sendBtn = btn;
              break;
            }
          }
        }
      }
    }
    
    if (sendBtn) {
      sendBtn.click();
      log('Kliknięto przycisk Wyślij', 'success');
      callback(true);
    } else {
      // Fallback: Use Enter key
      log('Brak przycisku Wyślij, wysyłam Enterem...', 'info');
      if (window.AndroidSniper && typeof window.AndroidSniper.pressEnter === 'function') {
        input.focus();
        window.AndroidSniper.pressEnter();
        log('Natywny Enter wysłany', 'info');
      } else {
        var ev = new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true, composed: true
        });
        input.dispatchEvent(ev);
        log('JS Enter wysłany', 'info');
      }
      callback(true);
    }
  }

  var observer = new MutationObserver(function(mutations) {
    if (window.__SNIPER_STATE__.fired) return;
    for (var m = 0; m < mutations.length; m++) {
      if (mutations[m].addedNodes.length > 0) {
        var num = findLastNumber();
        if (num !== null && num !== window.__SNIPER_STATE__.lastNumber) {
          window.__SNIPER_STATE__.lastNumber = num;
          log('Wykryto: ' + num, 'info');
          if (window.AndroidSniper) window.AndroidSniper.onNumberDetected(num);
          
          if (window.__SNIPER_CONFIG__ && 
              window.__SNIPER_CONFIG__.strategy === 'wait' && 
              Date.now() >= window.__SNIPER_CONFIG__.targetTime) {
             log('Doczekano się aktywności! Strzelam...', 'success');
             window.__SNIPER_FIRE__('dynamic');
          }
        }
        return;
      }
    }
  });
  observer.observe(document.body, {childList:true, subtree:true});

  var initial = findLastNumber();
  if (initial !== null) {
    window.__SNIPER_STATE__.lastNumber = initial;
    log('Startowy numer: ' + initial, 'info');
  }

  window.__SNIPER_FIRE__ = function(strategy) {
    if (window.__SNIPER_STATE__.fired) return false;
    window.__SNIPER_STATE__.fired = true; // Mark as fired immediately to prevent duplicate runs
    
    var start = performance.now();
    var msg = '+1'; // Domyślnie
    
    if (strategy === 'fixed') {
      log('Strategia sztywna: wysyłam +1', 'info');
      msg = '+1';
    } else {
      var fresh = findLastNumber();
      msg = fresh !== null ? String(fresh + 1) : '+1';
      log('Strategia dynamiczna (N+1): wysyłam ' + msg, 'info');
    }
    
    sendMessage(msg, function(success) {
      var elapsed = performance.now() - start;
      if (success) {
        window.__SNIPER_STATE__.status = 'success';
        log('Wysłano: ' + msg + ' (' + elapsed.toFixed(1) + 'ms)', 'success');
        if (window.AndroidSniper) window.AndroidSniper.onMessageSent(msg, elapsed);
      } else {
        window.__SNIPER_STATE__.status = 'error';
        // Release native WakeLock even on error so it doesn't drain battery
        if (window.AndroidSniper) window.AndroidSniper.onMessageSent('BŁĄD', elapsed);
      }
    });
    return true;
  };

  log('Monitor aktywny', 'success');
})();
