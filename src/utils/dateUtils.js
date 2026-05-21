/**
 * Calculate the next occurrence of a given day+time from now.
 * @param {number} dayOfWeek - 0 (Sunday) to 6 (Saturday)
 * @param {number} hours - 0 to 23
 * @param {number} minutes - 0 to 59
 * @returns {Date}
 */
export function getNextOccurrence(dayOfWeek, hours, minutes) {
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
