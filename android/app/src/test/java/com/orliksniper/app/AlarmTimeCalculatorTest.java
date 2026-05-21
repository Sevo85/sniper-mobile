package com.orliksniper.app;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class AlarmTimeCalculatorTest {

    @Test
    public void testCalculateTriggerTime_FutureTarget() {
        // Target is 12:10:00Z
        String targetTime = "2026-04-29T12:10:00Z";
        // Current is 12:00:00Z
        long currentTimeMs = java.time.OffsetDateTime.parse("2026-04-29T12:00:00Z").toInstant().toEpochMilli();
        
        long triggerAt = AlarmTimeCalculator.calculateTriggerTime(targetTime, currentTimeMs);
        
        // Expected trigger: 12:07:00Z (3 mins before)
        long expectedTriggerAt = java.time.OffsetDateTime.parse("2026-04-29T12:07:00Z").toInstant().toEpochMilli();
        assertEquals("Should trigger 3 minutes before target", expectedTriggerAt, triggerAt);
    }

    @Test
    public void testCalculateTriggerTime_TargetTooClose() {
        // Target is 12:02:00Z (only 2 mins away)
        String targetTime = "2026-04-29T12:02:00Z";
        // Current is 12:00:00Z
        long currentTimeMs = java.time.OffsetDateTime.parse("2026-04-29T12:00:00Z").toInstant().toEpochMilli();
        
        long triggerAt = AlarmTimeCalculator.calculateTriggerTime(targetTime, currentTimeMs);
        
        // Expected trigger: Current time + 1 second (since 3 mins before is in the past)
        long expectedTriggerAt = currentTimeMs + AlarmTimeCalculator.MIN_DELAY_MS;
        assertEquals("Should trigger with minimum delay if target is too close", expectedTriggerAt, triggerAt);
    }

    @Test
    public void testCalculateTriggerTime_TargetInPast() {
        // Target is 11:50:00Z (10 mins in the past)
        String targetTime = "2026-04-29T11:50:00Z";
        // Current is 12:00:00Z
        long currentTimeMs = java.time.OffsetDateTime.parse("2026-04-29T12:00:00Z").toInstant().toEpochMilli();
        
        long triggerAt = AlarmTimeCalculator.calculateTriggerTime(targetTime, currentTimeMs);
        
        // Expected trigger: Current time + 1 second
        long expectedTriggerAt = currentTimeMs + AlarmTimeCalculator.MIN_DELAY_MS;
        assertEquals("Should trigger with minimum delay if target is in the past", expectedTriggerAt, triggerAt);
    }
}
