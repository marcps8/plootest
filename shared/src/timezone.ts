import { DateTime } from "luxon";

export const DEFAULT_TIMEZONE = "Europe/Madrid";

/**
 * Converts a local datetime in Europe/Madrid to UTC ISO string for storage.
 * Handles DST transitions correctly (spring forward / fall back).
 */
export function madridLocalToUtc(isoLocal: string): string {
  const dt = DateTime.fromISO(isoLocal, { zone: DEFAULT_TIMEZONE });
  if (!dt.isValid) {
    throw new Error(`Invalid datetime for ${DEFAULT_TIMEZONE}: ${isoLocal}`);
  }
  return dt.toUTC().toISO()!;
}

/**
 * Converts stored UTC back to Europe/Madrid for display/tests.
 */
export function utcToMadrid(isoUtc: string): DateTime {
  return DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(DEFAULT_TIMEZONE);
}

/**
 * Returns true if the given UTC instant, when shown in Madrid, matches expected local parts.
 */
export function madridWallClock(
  isoUtc: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const local = utcToMadrid(isoUtc);
  return {
    year: local.year,
    month: local.month,
    day: local.day,
    hour: local.hour,
    minute: local.minute,
  };
}
