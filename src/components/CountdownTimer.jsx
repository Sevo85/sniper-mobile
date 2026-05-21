import { useState, useEffect, useMemo } from 'react';

/**
 * CountdownTimer — Displays time remaining until target.
 * Shows DD:HH:MM:SS with glow effect in last 60 seconds.
 */
export default function CountdownTimer({ targetTime }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = useMemo(() => {
    if (!targetTime) return null;
    const target = new Date(targetTime).getTime();
    const diff = target - now;

    if (diff <= 0) {
      return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    return {
      total: diff,
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  }, [targetTime, now]);

  const isUrgent = remaining && remaining.total > 0 && remaining.total <= 60000;
  const isExpired = remaining && remaining.total <= 0;

  const pad = (n) => String(n).padStart(2, '0');

  if (!targetTime) {
    return (
      <div className="countdown glass-card" id="countdown-timer">
        <div className="countdown__label">Następny strzał</div>
        <div className="countdown__digits">
          <div className="countdown__digit-block">
            <span className="countdown__digit-pair text-muted">--</span>
            <span className="countdown__block-label">godz</span>
          </div>
          <span className="countdown__colon">:</span>
          <div className="countdown__digit-block">
            <span className="countdown__digit-pair text-muted">--</span>
            <span className="countdown__block-label">min</span>
          </div>
          <span className="countdown__colon">:</span>
          <div className="countdown__digit-block">
            <span className="countdown__digit-pair text-muted">--</span>
            <span className="countdown__block-label">sek</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`countdown glass-card ${isUrgent ? 'countdown--urgent' : ''}`}
      id="countdown-timer"
    >
      <div className="countdown__label">
        {isExpired ? 'Czas minął' : 'Następny strzał za'}
      </div>
      <div className="countdown__digits">
        {remaining.days > 0 && (
          <>
            <div className="countdown__digit-block">
              <span className="countdown__digit-pair">{pad(remaining.days)}</span>
              <span className="countdown__block-label">dni</span>
            </div>
            <span className="countdown__colon">:</span>
          </>
        )}
        <div className="countdown__digit-block">
          <span className={`countdown__digit-pair ${isExpired ? 'text-muted' : ''}`}>
            {isExpired ? '00' : pad(remaining.hours)}
          </span>
          <span className="countdown__block-label">godz</span>
        </div>
        <span className="countdown__colon">:</span>
        <div className="countdown__digit-block">
          <span className={`countdown__digit-pair ${isExpired ? 'text-muted' : ''}`}>
            {isExpired ? '00' : pad(remaining.minutes)}
          </span>
          <span className="countdown__block-label">min</span>
        </div>
        <span className="countdown__colon">:</span>
        <div className="countdown__digit-block">
          <span className={`countdown__digit-pair ${isExpired ? 'text-muted' : ''}`}>
            {isExpired ? '00' : pad(remaining.seconds)}
          </span>
          <span className="countdown__block-label">sek</span>
        </div>
      </div>
    </div>
  );
}
