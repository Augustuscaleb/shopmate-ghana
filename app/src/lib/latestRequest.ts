/**
 * "Latest request wins" (Stage 1C-3.1, Review-2 findings 1 and 3). Pure, so it can be unit-tested;
 * screens use it through ui/useLatestRequest.ts.
 *
 * A screen that reloads its data can have two reads running at once (a refresh when the app
 * returns, and a reload after a save). The answers can arrive in either order; an OLDER answer
 * must never replace a newer one on screen. And an automatic refresh must not start a second,
 * identical read while one is already running (for example when the app returns during the
 * first load).
 *
 * - start(): begins a read and returns its token; it supersedes every earlier read.
 * - isLatest(token): whether that read's answer may still be shown.
 * - finish(token): the read has ended (success or failure).
 * - running: a read is in flight (an automatic refresh skips; it would only repeat it).
 */
export class LatestRequest {
  private latest = 0;
  private inFlight = new Set<number>();

  start(): number {
    this.latest += 1;
    this.inFlight.add(this.latest);
    return this.latest;
  }

  isLatest(token: number): boolean {
    return token === this.latest;
  }

  finish(token: number): void {
    this.inFlight.delete(token);
  }

  /** Whether the latest read is still running (an older, superseded read doesn't count). */
  get running(): boolean {
    return this.inFlight.has(this.latest);
  }

  /**
   * Runs `read` as the latest request. `apply` receives the answer only if no newer request has
   * started meanwhile; `failed` likewise receives the error only then. Returns whether the
   * answer (or error) was the latest one.
   */
  async run<T>(read: () => Promise<T>, apply: (value: T) => void | Promise<void>, failed?: (error: unknown) => void): Promise<boolean> {
    const token = this.start();
    let value: T;
    try {
      value = await read();
    } catch (e) {
      this.finish(token);
      if (!this.isLatest(token)) return false;
      if (!failed) throw e;
      failed(e);
      return true;
    }
    try {
      if (!this.isLatest(token)) return false;
      await apply(value);
      return true;
    } finally {
      this.finish(token);
    }
  }
}
