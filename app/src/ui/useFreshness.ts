/**
 * Reloads a screen's data when another device may have changed it (increment 2b; spec SY-74):
 * when the app returns to the foreground, when the screen becomes visible again, and every
 * 15 minutes while the screen is visible and the app is active. Uses React Native's built-in
 * AppState only (no package). The decisions are in lib/freshness.ts (unit-tested).
 *
 * Never reloads while the app is in the background, while the screen is hidden, or while
 * `busy` is true (a save in progress). A reload that was due while busy runs as soon as the
 * save ends (if the screen is still visible and the app active).
 */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { msUntilPeriodicRefresh, onHidden, onSaveEnded, onTrigger, shouldRefresh, type Postponed, type RefreshTrigger } from '../lib/freshness';

export function useFreshness({ visible, lastLoadedAt, busy = false, refresh }: {
  /** The screen is on screen (its tab is selected and nothing covers it). */
  visible: boolean;
  /** When the data was last loaded or last attempted (ms since epoch); null if never. */
  lastLoadedAt: number | null;
  busy?: boolean;
  /** Reload silently: keep what is on screen, and keep it if the reload fails. */
  refresh: (trigger: RefreshTrigger) => void;
}) {
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastRef = useRef(lastLoadedAt);
  lastRef.current = lastLoadedAt;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  /** A trigger that arrived while a save was in progress (rules in lib/freshness.ts). */
  const postponed = useRef<Postponed>(null);

  const attempt = (trigger: RefreshTrigger) => {
    const out = onTrigger(trigger, shouldRefresh(trigger, lastRef.current, Date.now()), busyRef.current, postponed.current);
    postponed.current = out.postponed;
    if (out.run) refreshRef.current(out.run);
  };

  // Foreground: background/inactive → active
  useEffect(() => {
    let previous: string | null = AppState.currentState ?? null;
    const sub = AppState.addEventListener('change', (next) => {
      const cameBack = previous !== 'active' && next === 'active';
      previous = next;
      setAppActive(next === 'active');
      if (cameBack && visibleRef.current) attempt('foreground');
    });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Shown again (another tab, or the screen on top was closed)
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (!visible) postponed.current = onHidden();
    else if (!wasVisible.current && appActive) attempt('became_visible');
    wasVisible.current = visible;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // A save finished while a reload was due
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const out = onSaveEnded(postponed.current, visibleRef.current, appActive);
      postponed.current = out.postponed;
      if (out.run) refreshRef.current(out.run);
    }
    wasBusy.current = busy;
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every 15 minutes while visible and active; the timer stops in the background
  useEffect(() => {
    if (!visible || !appActive) return;
    const t = setTimeout(() => attempt('periodic'), msUntilPeriodicRefresh(lastLoadedAt, Date.now()) || 1_000);
    return () => clearTimeout(t);
  }, [visible, appActive, lastLoadedAt]); // eslint-disable-line react-hooks/exhaustive-deps
}
