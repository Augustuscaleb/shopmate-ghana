import { useSyncExternalStore } from 'react';
import { appConnectivity, type Connectivity } from '../lib/connectivity';

/** The app-wide online state (lib/connectivity.ts). */
export function useConnectivity(): Connectivity {
  return useSyncExternalStore(
    (onChange) => appConnectivity.subscribe(() => onChange()),
    () => appConnectivity.state,
    () => appConnectivity.state,
  );
}
