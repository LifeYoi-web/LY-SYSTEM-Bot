import { describe, it, expect, vi, beforeEach } from 'vitest';

const { putSpy } = vi.hoisted(() => ({ putSpy: vi.fn().mockResolvedValue(undefined) }));

vi.mock('discord.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('discord.js')>();
  class FakeREST {
    setToken() { return this; }
    put = putSpy;
  }
  return { ...orig, REST: FakeREST };
});

import { Collection } from 'discord.js';
import { registerCommands } from '../src/bot/loader';

beforeEach(() => putSpy.mockClear());

function commands() {
  const c = new Collection<string, any>();
  c.set('ping', { data: { toJSON: () => ({ name: 'ping' }) }, execute: vi.fn() });
  return c;
}

describe('registerCommands', () => {
  it('guild-scoped: puts guild commands then clears global (legacy path unchanged)', async () => {
    await registerCommands(commands(), 'tok', 'app1', 'g1');
    const urls = putSpy.mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe('/applications/app1/guilds/g1/commands');
    expect(urls[1]).toBe('/applications/app1/commands');
    expect(putSpy.mock.calls[1][1]).toEqual({ body: [] });
  });

  it('global: puts global commands and clears the stale guild set', async () => {
    await registerCommands(commands(), 'tok', 'app1', undefined, { clearGuildId: 'g1' });
    const urls = putSpy.mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe('/applications/app1/commands');
    expect(putSpy.mock.calls[0][1].body).toHaveLength(1);
    expect(urls[1]).toBe('/applications/app1/guilds/g1/commands');
    expect(putSpy.mock.calls[1][1]).toEqual({ body: [] });
  });

  it('global without clearGuildId: single global put only', async () => {
    await registerCommands(commands(), 'tok', 'app1');
    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(putSpy.mock.calls[0][0]).toBe('/applications/app1/commands');
  });
});
