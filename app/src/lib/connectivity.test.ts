import { describe, expect, it } from 'vitest';
import { ConnectivityMonitor } from './connectivity';

describe('Online state for internet-only actions (E-04, TC-COST-19, D-2, D-3)', () => {
  it('CONN-01: starts unknown, with internet-only actions allowed until offline is known', () => {
    const m = new ConnectivityMonitor();
    expect(m.state).toBe('unknown');
    expect(m.onlineActionsAllowed).toBe(true);
  });

  it('CONN-02: no response means offline (actions paused); any server answer means online again', () => {
    const m = new ConnectivityMonitor();
    m.reportNoResponse();
    expect(m.state).toBe('offline');
    expect(m.onlineActionsAllowed).toBe(false);
    m.reportServerResponse();
    expect(m.state).toBe('online');
    expect(m.onlineActionsAllowed).toBe(true);
  });

  it('CONN-03: listeners hear changes only, and can unsubscribe', () => {
    const m = new ConnectivityMonitor();
    const seen: string[] = [];
    const stop = m.subscribe((s) => seen.push(s));
    m.reportServerResponse();
    m.reportServerResponse();
    m.reportNoResponse();
    stop();
    m.reportServerResponse();
    expect(seen).toEqual(['online', 'offline']);
  });

  it('CONN-04: a device signal can drive the state; "don\'t know" changes nothing', () => {
    const m = new ConnectivityMonitor();
    m.setDeviceSignal(false);
    expect(m.state).toBe('offline');
    m.setDeviceSignal(null);
    expect(m.state).toBe('offline');
    m.setDeviceSignal(true);
    expect(m.state).toBe('online');
  });
});
