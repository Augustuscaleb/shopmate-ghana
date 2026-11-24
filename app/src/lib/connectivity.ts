/**
 * Online state for internet-only (🌐) actions: E-04, TC-COST-19, owner decisions D-2 and D-3.
 *
 * Until `expo-network` is installed (approved in principle, installation pending separate owner
 * approval), the app learns its state only from request outcomes: a request that reaches the
 * server means online; a request that fails without any server response means offline. A device
 * signal can be fed in later through `setDeviceSignal` without changing the screens.
 */
export type Connectivity = 'unknown' | 'online' | 'offline';

type Listener = (state: Connectivity) => void;

export class ConnectivityMonitor {
  private current: Connectivity = 'unknown';
  private listeners = new Set<Listener>();

  get state(): Connectivity {
    return this.current;
  }

  /** Internet-only actions are allowed unless the app knows it is offline. */
  get onlineActionsAllowed(): boolean {
    return this.current !== 'offline';
  }

  /** The server answered (success or a definite error): the phone is online. */
  reportServerResponse(): void {
    this.set('online');
  }

  /** A request failed with no server response (no network, timeout). */
  reportNoResponse(): void {
    this.set('offline');
  }

  /** For a future device network module: `null` means the device doesn't know. */
  setDeviceSignal(connected: boolean | null): void {
    if (connected === null) return;
    this.set(connected ? 'online' : 'offline');
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private set(next: Connectivity): void {
    if (next === this.current) return;
    this.current = next;
    for (const l of this.listeners) l(next);
  }
}
