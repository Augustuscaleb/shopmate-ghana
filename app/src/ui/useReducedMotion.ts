import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SharedReducedMotion } from './reducedMotionState';

/**
 * One app-wide reduce-motion state (see reducedMotionState.ts). On Android, React Native reports
 * "reduce motion" when the system transition-animation scale is 0, which Accessibility →
 * "Remove animations" sets; partial scales and manufacturer-specific settings are not detected.
 */
export const reducedMotion = new SharedReducedMotion({
  check: () => AccessibilityInfo.isReduceMotionEnabled(),
  listen: (onChange) => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', onChange);
    return () => sub.remove();
  },
});

/** True when motion should be reduced (also true until the phone's setting is known). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(reducedMotion.subscribe, () => reducedMotion.current, () => true);
}
