import { describe, it, expect, vi } from 'vitest';
import { boot } from '../src/boot';

function baseDeps() {
  return {
    guildId: 'g1',
    login: vi.fn().mockResolvedValue(undefined),
    ensureGuildSettings: vi.fn().mockResolvedValue(undefined),
    startApiServer: vi.fn(),
    startScheduler: vi.fn(),
    registerCommands: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn(),
    logInfo: vi.fn(),
  };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('boot', () => {
  // This is the regression test for the 5/24 outage: a Discord command-registration
  // call hung, and because it was awaited BEFORE the API server started, the whole
  // dashboard 502'd. The server must come up regardless of registration.
  it('starts the API server even when command registration hangs (never resolves)', async () => {
    const deps = baseDeps();
    deps.registerCommands = vi.fn().mockReturnValue(new Promise(() => undefined)); // never settles
    await boot(deps as any);
    expect(deps.startApiServer).toHaveBeenCalledTimes(1);
    expect(deps.startScheduler).toHaveBeenCalledTimes(1);
  }, 2000);

  it('starts the API server and logs a warning when command registration rejects', async () => {
    const deps = baseDeps();
    deps.registerCommands = vi.fn().mockRejectedValue(new Error('429 rate limited'));
    await boot(deps as any);
    expect(deps.startApiServer).toHaveBeenCalledTimes(1);
    await flush(); // let the isolated catch run
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining('Command registration failed'));
  });

  it('logs in and ensures settings before serving, and registers commands after', async () => {
    const deps = baseDeps();
    const order: string[] = [];
    deps.login = vi.fn(async () => { order.push('login'); });
    deps.ensureGuildSettings = vi.fn(async () => { order.push('settings'); });
    deps.startApiServer = vi.fn(() => { order.push('server'); });
    deps.registerCommands = vi.fn(async () => { order.push('register'); });
    await boot(deps as any);
    await flush();
    expect(deps.ensureGuildSettings).toHaveBeenCalledWith('g1');
    expect(order).toEqual(['login', 'settings', 'server', 'register']);
  });

  // SaaS Phase 0 (spec §6.2): one bad token must NOT take the process down — the
  // dashboard/API still starts so the owner can see and fix it. This intentionally
  // replaces the old "propagates a login failure" behavior.
  it('starts the API server even when login fails (bad token must not crash boot)', async () => {
    const deps = baseDeps();
    deps.login = vi.fn().mockRejectedValue(new Error('invalid token'));
    await boot(deps as any);
    expect(deps.startApiServer).toHaveBeenCalledTimes(1);
    expect(deps.startScheduler).toHaveBeenCalledTimes(1);
    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining('Discord login failed'));
  });

  it('retries login in the background until it succeeds, then stops', async () => {
    vi.useFakeTimers();
    try {
      const deps = baseDeps();
      deps.login = vi
        .fn()
        .mockRejectedValueOnce(new Error('net down')) // boot attempt
        .mockRejectedValueOnce(new Error('net down')) // retry #1
        .mockResolvedValue(undefined); // retry #2 succeeds
      await boot(deps as any);
      expect(deps.login).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(deps.login).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(deps.login).toHaveBeenCalledTimes(3);
      expect(deps.logInfo).toHaveBeenCalledWith(expect.stringContaining('login retry succeeded'));
      await vi.advanceTimersByTimeAsync(300_000); // after success: no more attempts
      expect(deps.login).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start a retry loop when login succeeds first try', async () => {
    vi.useFakeTimers();
    try {
      const deps = baseDeps();
      await boot(deps as any);
      await vi.advanceTimersByTimeAsync(600_000);
      expect(deps.login).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never overlaps login attempts when one hangs across a tick boundary', async () => {
    vi.useFakeTimers();
    try {
      const deps = baseDeps();
      let hangingResolves = 0;
      deps.login = vi
        .fn()
        .mockRejectedValueOnce(new Error('net down')) // boot attempt fails → retry loop armed
        .mockImplementation(
          () =>
            new Promise(() => {
              hangingResolves++; // retry #1 hangs forever
            }),
        );
      await boot(deps as any);
      await vi.advanceTimersByTimeAsync(60_000); // retry #1 fires and hangs
      await vi.advanceTimersByTimeAsync(180_000); // 3 more ticks — must all be skipped
      expect(deps.login).toHaveBeenCalledTimes(2); // boot + the single hanging retry
      expect(hangingResolves).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
