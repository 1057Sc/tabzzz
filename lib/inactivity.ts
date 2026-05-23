const LUNCH_PAUSE_START_HOUR = 12;
const LUNCH_PAUSE_END_HOUR = 14;

export const AUTO_SLEEP_PAUSE_NOTICE = 'Local 12:00-14:00 is ignored.';

function startOfLocalDay(timestamp: number): Date {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getLocalPauseWindow(day: Date): { startMs: number; endMs: number } {
  const start = new Date(day);
  start.setHours(LUNCH_PAUSE_START_HOUR, 0, 0, 0);

  const end = new Date(day);
  end.setHours(LUNCH_PAUSE_END_HOUR, 0, 0, 0);

  return { startMs: start.getTime(), endMs: end.getTime() };
}

function getPauseOverlapMs(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;

  let overlapMs = 0;
  const cursor = startOfLocalDay(fromMs);
  const endDayMs = startOfLocalDay(toMs).getTime();

  while (cursor.getTime() <= endDayMs) {
    const { startMs, endMs } = getLocalPauseWindow(cursor);
    const overlapStart = Math.max(fromMs, startMs);
    const overlapEnd = Math.min(toMs, endMs);

    if (overlapEnd > overlapStart) {
      overlapMs += overlapEnd - overlapStart;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return overlapMs;
}

export function getEffectiveInactiveMs(lastActiveAt: number, nowMs = Date.now()): number {
  const rawInactiveMs = Math.max(0, nowMs - lastActiveAt);
  const pauseOverlapMs = getPauseOverlapMs(lastActiveAt, nowMs);
  return Math.max(0, rawInactiveMs - pauseOverlapMs);
}
