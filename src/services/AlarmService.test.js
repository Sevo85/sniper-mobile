import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlarmService } from './AlarmService.js';

describe('AlarmService', () => {
  let service;
  
  beforeEach(() => {
    // Reset date mocks
    vi.useFakeTimers();
    // Create fresh instance for each test
    service = new AlarmService();
    // Mock the capacitor check to be false for testing browser fallback
    service.isCapacitor = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('powinien ustawiać alarm na 3 minuty przed celem', async () => {
    const now = new Date('2026-04-29T12:00:00Z');
    vi.setSystemTime(now);

    const targetTime = new Date('2026-04-29T12:05:00Z'); // 5 minut w przyszłość
    const callback = vi.fn();
    
    // Mock the internal log to prevent noise
    service._log = vi.fn();

    await service.schedule(targetTime, callback);
    
    // 3 minuty przed celem to 12:02:00. Startujemy o 12:00:00.
    // Powinien czekać 2 minuty (120 000 ms).
    expect(service.isActive()).toBe(true);
    expect(callback).not.toHaveBeenCalled();

    // Przesuń czas o 119 sekund
    vi.advanceTimersByTime(119000);
    expect(callback).not.toHaveBeenCalled();

    // Przesuń o kolejną sekundę do pełnych 2 minut
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('powinien odpalić od razu, jeśli cel jest bliżej niż 3 minuty, ale jeszcze nie minął', async () => {
    const now = new Date('2026-04-29T12:00:00Z');
    vi.setSystemTime(now);

    // Cel za 2 minuty (mniej niż 3 minuty wyprzedzenia)
    const targetTime = new Date('2026-04-29T12:02:00Z'); 
    const callback = vi.fn();
    
    service._log = vi.fn();

    await service.schedule(targetTime, callback);
    
    // Ponieważ jesteśmy już po czasie alarmu (który był na 11:59:00), 
    // ale wciąż przed czasem celu, powinno wystrzelić od razu.
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('powinien odrzucić cel z przeszłości', async () => {
    const now = new Date('2026-04-29T12:00:00Z');
    vi.setSystemTime(now);

    // Cel w przeszłości
    const targetTime = new Date('2026-04-29T11:50:00Z'); 
    const callback = vi.fn();
    
    service._log = vi.fn();

    await service.schedule(targetTime, callback);
    
    // Nie powinien w ogóle się aktywować
    expect(callback).not.toHaveBeenCalled();
    expect(service.isActive()).toBe(false);
  });
});
