import { useState, useEffect } from 'react';

const DAYS = [
  { value: 0, label: 'Niedziela', short: 'Ndz' },
  { value: 1, label: 'Poniedziałek', short: 'Pon' },
  { value: 2, label: 'Wtorek', short: 'Wt' },
  { value: 3, label: 'Środa', short: 'Śr' },
  { value: 4, label: 'Czwartek', short: 'Czw' },
  { value: 5, label: 'Piątek', short: 'Pt' },
  { value: 6, label: 'Sobota', short: 'Sob' },
];

/**
 * Calculate the next occurrence of a given day+time from now.
 */
function getNextOccurrence(dayOfWeek, hours, minutes) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  // Calculate days until target day
  let daysUntil = dayOfWeek - now.getDay();
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && target <= now) daysUntil = 7;

  target.setDate(target.getDate() + daysUntil);
  return target;
}

/**
 * ScheduleScreen — Recurring weekly sniper schedules.
 */
export default function ScheduleScreen({
  schedules,
  onSchedulesChange,
  config,
  isLoggedIn,
  onLogin,
}) {
  const [selectedDay, setSelectedDay] = useState(0); // Sunday
  const [selectedTime, setSelectedTime] = useState('12:00');
  const [editingIndex, setEditingIndex] = useState(null);

  const handleAdd = () => {
    if (!config.chatUrl) return;

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const nextRun = getNextOccurrence(selectedDay, hours, minutes);

    const newSchedule = {
      id: Date.now(),
      dayOfWeek: selectedDay,
      time: selectedTime,
      chatUrl: config.chatUrl,
      strategy: config.strategy || 'dynamic',
      enabled: true,
      nextRun: nextRun.toISOString(),
    };

    if (editingIndex !== null) {
      const updated = [...schedules];
      updated[editingIndex] = { ...updated[editingIndex], ...newSchedule, id: updated[editingIndex].id };
      onSchedulesChange(updated);
      setEditingIndex(null);
    } else {
      onSchedulesChange([...schedules, newSchedule]);
    }
  };

  const handleRemove = (index) => {
    const updated = schedules.filter((_, i) => i !== index);
    onSchedulesChange(updated);
  };

  const handleToggle = (index) => {
    const updated = [...schedules];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };

    // Recalculate nextRun if enabling
    if (updated[index].enabled) {
      const [hours, minutes] = updated[index].time.split(':').map(Number);
      updated[index].nextRun = getNextOccurrence(updated[index].dayOfWeek, hours, minutes).toISOString();
    }

    onSchedulesChange(updated);
  };

  const handleEdit = (index) => {
    const schedule = schedules[index];
    setSelectedDay(schedule.dayOfWeek);
    setSelectedTime(schedule.time);
    setEditingIndex(index);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setSelectedDay(0);
    setSelectedTime('12:00');
  };

  const getDayLabel = (dayValue) => DAYS.find(d => d.value === dayValue)?.label || '';
  const getDayShort = (dayValue) => DAYS.find(d => d.value === dayValue)?.short || '';

  const formatNextRun = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    const now = new Date();
    const diffMs = d - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      return `dziś o ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `jutro o ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return d.toLocaleDateString('pl-PL', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  return (
    <div className="config screen-enter" id="schedule-screen">
      {/* Session Status */}
      {!isLoggedIn && (
        <div className="glass-card config__section">
          <div className="config__section-title">
            <span>🔑</span> Sesja Facebook
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Najpierw zaloguj się do Messengera.
          </p>
          <button className="btn btn--ghost" onClick={onLogin} type="button">
            <span>🌐</span> Otwórz Messenger
          </button>
        </div>
      )}

      {/* Add/Edit Schedule */}
      <div className="glass-card config__section">
        <div className="config__section-title">
          <span>📅</span> {editingIndex !== null ? 'Edytuj harmonogram' : 'Nowy harmonogram'}
        </div>

        {/* Day picker */}
        <div className="form-group">
          <label className="form-label">Dzień tygodnia</label>
          <div className="schedule-days">
            {DAYS.map(day => (
              <button
                key={day.value}
                type="button"
                className={`schedule-day ${selectedDay === day.value ? 'schedule-day--active' : ''}`}
                onClick={() => setSelectedDay(day.value)}
              >
                {day.short}
              </button>
            ))}
          </div>
        </div>

        {/* Time picker */}
        <div className="form-group">
          <label className="form-label" htmlFor="schedule-time">Godzina strzału</label>
          <input
            id="schedule-time"
            type="time"
            className="form-input"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value || '12:00')}
            step="60"
          />
          <span className="form-hint">Snajper obudzi się 1 min wcześniej i przygotuje WebView</span>
        </div>

        {/* Chat URL reminder */}
        {!config.chatUrl && (
          <div className="info-bar" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.2)', color: 'var(--status-armed)' }}>
            <span className="info-bar__icon">⚠️</span>
            Ustaw URL czatu w zakładce Konfiguracja
          </div>
        )}

        {config.chatUrl && (
          <div className="info-bar">
            <span className="info-bar__icon">💬</span>
            <span className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.8 }}>
              {config.chatUrl.length > 30
                ? config.chatUrl.substring(0, 30) + '...'
                : config.chatUrl}
            </span>
          </div>
        )}

        {/* Preview next run */}
        {config.chatUrl && (
          <div className="schedule-preview">
            <span className="schedule-preview__icon">🎯</span>
            <div>
              <div className="schedule-preview__label">Następne uruchomienie</div>
              <div className="schedule-preview__value">
                {getDayLabel(selectedDay)} o {selectedTime}
              </div>
              <div className="schedule-preview__next">
                → {selectedTime && selectedTime.includes(':') 
                  ? formatNextRun(getNextOccurrence(selectedDay, ...selectedTime.split(':').map(Number)).toISOString())
                  : '—'}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            className="btn btn--primary"
            onClick={handleAdd}
            type="button"
            disabled={!config.chatUrl}
          >
            <span>{editingIndex !== null ? '✏️' : '➕'}</span>
            {editingIndex !== null ? 'Zapisz zmiany' : 'Dodaj do harmonogramu'}
          </button>
          {editingIndex !== null && (
            <button
              className="btn btn--ghost"
              onClick={handleCancelEdit}
              type="button"
              style={{ width: 'auto', flexShrink: 0 }}
            >
              Anuluj
            </button>
          )}
        </div>
      </div>

      {/* Schedules List */}
      {schedules.length > 0 && (
        <div className="glass-card config__section">
          <div className="config__section-title">
            <span>🔄</span> Aktywne harmonogramy ({schedules.length})
          </div>

          <div className="schedule-list">
            {schedules.map((schedule, index) => (
              <div
                key={schedule.id}
                className={`schedule-item ${!schedule.enabled ? 'schedule-item--disabled' : ''}`}
              >
                <div className="schedule-item__main">
                  <div className="schedule-item__toggle">
                    <button
                      type="button"
                      className={`toggle-switch ${schedule.enabled ? 'toggle-switch--on' : ''}`}
                      onClick={() => handleToggle(index)}
                      aria-label={schedule.enabled ? 'Wyłącz' : 'Włącz'}
                    >
                      <div className="toggle-switch__knob" />
                    </button>
                  </div>

                  <div className="schedule-item__info">
                    <div className="schedule-item__day">
                      {getDayLabel(schedule.dayOfWeek)}
                    </div>
                    <div className="schedule-item__time">
                      {schedule.time}
                    </div>
                    {schedule.enabled && (
                      <div className="schedule-item__next">
                        → {formatNextRun(schedule.nextRun)}
                      </div>
                    )}
                  </div>

                  <div className="schedule-item__actions">
                    <button
                      type="button"
                      className="schedule-action"
                      onClick={() => handleEdit(index)}
                      title="Edytuj"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="schedule-action schedule-action--danger"
                      onClick={() => handleRemove(index)}
                      title="Usuń"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="schedule-item__strategy">
                  🧠 {schedule.strategy === 'fixed' ? 'Stałe +1' : 'Dynamiczne (N+1)'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {schedules.length === 0 && (
        <div className="glass-card" style={{ padding: 'var(--space-2xl) var(--space-lg)', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)', opacity: 0.4 }}>📅</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-xs)' }}>
            Brak harmonogramów
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Dodaj cykliczny harmonogram, np. "każda niedziela o 12:00"
          </div>
        </div>
      )}
    </div>
  );
}

export { getNextOccurrence };
