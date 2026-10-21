/**
 * Controllable clock.
 *
 * The reminder and SLA engines never call `Date.now()` directly: they use this
 * module so automated tests can move time forward deterministically instead of
 * waiting two real hours (PRD §22.4).
 */

let override: number | null = null;

export const clock = {
  now(): Date {
    return new Date(override ?? Date.now());
  },
  nowMs(): number {
    return override ?? Date.now();
  },
  /** Move the clock to an absolute instant. */
  set(instant: Date | number | string): void {
    override = new Date(instant).getTime();
  },
  /** Move the clock forward by a number of milliseconds. */
  advance(milliseconds: number): void {
    override = clock.nowMs() + milliseconds;
  },
  /** Remove any override and return to the wall clock. */
  reset(): void {
    override = null;
  },
  get isOverridden(): boolean {
    return override !== null;
  },
};

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
