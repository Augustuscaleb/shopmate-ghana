/**
 * When a screen reloads data that another device may have changed (Stage 1C-2 increment 2b,
 * multi-device freshness; spec 06 SY-74 and SY-06). Pure functions with no React Native code,
 * so they can be unit-tested; the lifecycle wiring is in ui/useFreshness.ts.
 *
 * Triggers:
 * - manual:         pull-to-refresh, "Try again", or after this device's own save: always reload.
 * - foreground:     the app came back to the foreground: reload if the data is older than 30 s.
 * - became_visible: a screen that was hidden (another tab, or under another screen) is shown again.
 * - periodic:       a visible screen in an active app, every 15 minutes.
 * Nothing reloads while the app is in the background or while a save is in progress (the hook
 * enforces both).
 */
import { formatTime } from '../services/dashboard';

export type RefreshTrigger = 'manual' | 'foreground' | 'became_visible' | 'periodic';

/** A burst of foreground or visibility events within this time causes only one reload. */
export const MIN_AUTO_REFRESH_AGE_MS = 30_000;
/** SY-74: a visible screen reloads at least this often while the app is open. */
export const PERIODIC_REFRESH_MS = 15 * 60_000;

/**
 * Whether to reload now. `lastLoadedAt` is when the data on screen was last loaded (or last
 * attempted, so a failing server isn't retried more than every 30 s); null means never loaded.
 */
export function shouldRefresh(trigger: RefreshTrigger, lastLoadedAt: number | null, now: number): boolean {
  if (trigger === 'manual' || lastLoadedAt === null) return true;
  const age = now - lastLoadedAt;
  if (age < 0) return true; // the phone's clock moved backwards: don't trust the age
  return age >= (trigger === 'periodic' ? PERIODIC_REFRESH_MS : MIN_AUTO_REFRESH_AGE_MS);
}

/** Milliseconds until the next periodic reload is due (0 if already due). */
export function msUntilPeriodicRefresh(lastLoadedAt: number | null, now: number): number {
  if (lastLoadedAt === null) return 0;
  const age = now - lastLoadedAt;
  if (age < 0) return 0;
  return Math.max(0, PERIODIC_REFRESH_MS - age);
}

/**
 * The "Updated …" line (SY-06). After a failed refresh the time of the last SUCCESSFUL load is
 * shown with "couldn't refresh"; the data on screen is kept.
 */
export function updatedLabel(lastSuccessAt: string | null, now: Date, refreshFailed: boolean): string | null {
  if (!lastSuccessAt) return refreshFailed ? "Couldn't refresh" : null;
  const at = new Date(lastSuccessAt);
  if (Number.isNaN(at.getTime())) return refreshFailed ? "Couldn't refresh" : null;
  const time = whenText(at, now);
  if (refreshFailed) return `Last updated ${time} · couldn't refresh`;
  if (now.getTime() - at.getTime() < 60_000 && now.getTime() >= at.getTime()) return 'Updated just now';
  return `Updated ${time}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function whenText(at: Date, now: Date): string {
  const hhmm = formatTime(at.toISOString());
  if (sameDay(at, now)) return hhmm;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(at, yesterday)) return `yesterday ${hhmm}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${hhmm}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * A refresh that falls due while a save is in progress is postponed, and runs when the save ends
 * (review finding 6: the postponed refresh is dropped when the screen is hidden, and replaced by
 * any refresh that runs meanwhile, so a stale one never runs after a later save).
 */
export type Postponed = RefreshTrigger | null;
export type TriggerOutcome = { run: RefreshTrigger | null; postponed: Postponed };

/** A trigger arrived: run it, postpone it (saving), or ignore it (not due). Running clears any postponed one. */
export function onTrigger(trigger: RefreshTrigger, due: boolean, busy: boolean, postponed: Postponed): TriggerOutcome {
  if (!due) return { run: null, postponed };
  if (busy) return { run: null, postponed: trigger };
  return { run: trigger, postponed: null };
}

/** The save ended: run the postponed refresh only if the screen is visible and the app active. */
export function onSaveEnded(postponed: Postponed, visible: boolean, appActive: boolean): TriggerOutcome {
  if (postponed && visible && appActive) return { run: postponed, postponed: null };
  // Hidden or in the background: drop it; "shown again" / "came back" will refresh if still due
  return { run: null, postponed: null };
}

/** The screen was hidden: nothing stays postponed. */
export function onHidden(): Postponed {
  return null;
}
