/**
 * Shared "reduce motion" state for the whole app (owner-approved correction, 24 Nov 2026).
 *
 * - One native check and one native subscription, however many animated components are shown.
 * - Until the first native answer arrives, motion counts as REDUCED, so nothing can animate in
 *   the first frames for someone who has turned animations off.
 * - If the native check fails, motion stays reduced (the accessible choice).
 * - A change event that arrives before the first check's answer wins (it is newer).
 * - When the last consumer goes, the native subscription is removed; the next consumer re-checks.
 *
 * Pure TypeScript with the native source injected, so it is unit-tested without a device.
 * What the native source detects on Android is documented in docs/stages/STAGE-1C-2-VISUAL-DESIGN.md §5.
 */
export type MotionSource = {
  /** The current setting (Android: AccessibilityInfo.isReduceMotionEnabled). */
  check(): Promise<boolean>;
  /** Change events; returns a function that removes the listener. */
  listen(onChange: (reduced: boolean) => void): () => void;
};

type Listener = () => void;

export class SharedReducedMotion {
  private reduced = true;
  private known = false;
  private consumers = new Set<Listener>();
  private stopNative: (() => void) | null = null;
  private generation = 0;

  constructor(private source: MotionSource) {}

  /** The current value: true (reduced) until the native setting is known. */
  get current(): boolean {
    return this.reduced;
  }

  get isKnown(): boolean {
    return this.known;
  }

  /** Adds a consumer; starts the native check and subscription for the first one. */
  subscribe = (listener: Listener): (() => void) => {
    this.consumers.add(listener);
    if (this.consumers.size === 1) this.start();
    return () => {
      if (!this.consumers.delete(listener)) return;
      if (this.consumers.size === 0) this.stop();
    };
  };

  private start(): void {
    const gen = ++this.generation;
    let eventSeen = false;
    this.stopNative = this.source.listen((value) => {
      if (gen !== this.generation) return;
      eventSeen = true;
      this.set(value);
    });
    this.source.check().then(
      (value) => { if (gen === this.generation && !eventSeen) this.set(value); },
      () => { /* unknown: stay reduced */ },
    );
  }

  private stop(): void {
    this.generation++;
    this.stopNative?.();
    this.stopNative = null;
  }

  private set(value: boolean): void {
    const changed = value !== this.reduced || !this.known;
    this.reduced = value;
    this.known = true;
    if (changed) for (const l of [...this.consumers]) l();
  }
}
