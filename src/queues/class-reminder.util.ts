// Pure helpers for the class-reminder job (no Nest, no DB), so the date
// maths is easy to read and test.
//
// All "which day / what hour" decisions are made in Africa/Lagos, the app's
// timezone. Lagos is UTC+1 all year (no daylight saving), so a fixed offset
// is exact. Doing this explicitly (instead of the server's local clock, as
// the Express job did) keeps reminders correct on a UTC host.

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

// A Date whose UTC fields read as Lagos wall-clock time.
const toLagos = (date: Date) => new Date(date.getTime() + LAGOS_OFFSET_MS);

/**
 * When this class's session for TODAY (Lagos) starts, or null if it has no
 * session today. A recurring class's `schedule` is only its first-ever
 * occurrence, so only its time of day is used for later sessions.
 *
 * Differences from the Express job (deliberate): the weekday and time of day
 * are computed in Lagos time, and a recurring class that has not reached its
 * first occurrence yet is never reminded.
 */
export function getTodaysSessionStart(
  schedule: Date,
  recurrence: string,
  recurrenceDays: string[],
  now: Date,
): Date | null {
  if (recurrence === 'none') {
    // One-off: a single occurrence. Already started or passed: nothing to do.
    return schedule.getTime() > now.getTime() ? schedule : null;
  }

  const lagosNow = toLagos(now);
  const todayName = DAY_NAMES[lagosNow.getUTCDay()];

  const runsToday =
    recurrence === 'daily' ||
    recurrence === 'monthly' || // Express treats this as every day (kept)
    (recurrence === 'weekly' && recurrenceDays.includes(todayName));
  if (!runsToday) return null;

  const anchor = toLagos(schedule);
  const start = new Date(
    Date.UTC(
      lagosNow.getUTCFullYear(),
      lagosNow.getUTCMonth(),
      lagosNow.getUTCDate(),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
    ) - LAGOS_OFFSET_MS,
  );

  // Before the very first occurrence there is nothing to remind about.
  return start.getTime() < schedule.getTime() ? null : start;
}

// True if both instants fall on the same calendar day in Lagos.
export function isSameLagosDay(a: Date, b: Date): boolean {
  return (
    toLagos(a).toISOString().slice(0, 10) ===
    toLagos(b).toISOString().slice(0, 10)
  );
}

export function reminderMessage(className: string, minutesUntilStart: number) {
  const when =
    minutesUntilStart >= 45
      ? 'about an hour'
      : `about ${Math.max(1, Math.round(minutesUntilStart))} minute(s)`;
  return `"${className}" starts in ${when}.`;
}
