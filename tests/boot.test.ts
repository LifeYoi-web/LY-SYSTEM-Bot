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

  it('propagates a login failure (must crash the process, not be swallowed)', async () => {
    const deps = baseDeps();
    deps.login = vi.fn().mockRejectedValue(new Error('invalid token'));
    await expect(boot(deps as any)).rejects.toThrow('invalid token');
    expect(deps.startApiServer).not.toHaveBeenCalled();
  });
});
