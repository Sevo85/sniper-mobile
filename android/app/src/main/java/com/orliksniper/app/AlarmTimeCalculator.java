package com.orliksniper.app;

public class AlarmTimeCalculator {
    public static final long WAKEUP_BUFFER_MS = 3 * 60 * 1000L; // 3 minutes
    public static final long MIN_DELAY_MS = 1000L; // 1 second

    /**
     * Calculates the exact time in milliseconds to trigger the alarm.
     * 
     * @param targetTimeIso ISO-8601 formatted target time (e.g., "2026-04-29T12:00:00Z")
     * @param currentTimeMs Current system time in milliseconds
     * @return The absolute timestamp (in ms) when the alarm should fire
     * @throws java.time.format.DateTimeParseException if the date format is invalid
     */
    public static long calculateTriggerTime(String targetTimeIso, long currentTimeMs) {
        long targetTimeMs = java.time.OffsetDateTime.parse(targetTimeIso).toInstant().toEpochMilli();
        long triggerAtMillis = targetTimeMs - WAKEUP_BUFFER_MS;
        
        if (triggerAtMillis <= currentTimeMs) {
            triggerAtMillis = currentTimeMs + MIN_DELAY_MS;
        }
        
        return triggerAtMillis;
    }
}
