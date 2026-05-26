import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { getSettings, updateSettings } = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('../src/db/settingsCache', () => ({ getSettings, updateSettings }));

import { createBotRouter } from '../src/api/routes/bot';

const row = { guildId: 'g1', botPresenceType: null, botPresenceText: null, botPresenceUrl: null };

function fakeDeps(over: Record<string, unknown> = {}) {
  const setPresence = vi.fn();
  const deps = {
    client: { user: { setPresence }, guilds: { cache: { reduce: (_f: unknown, init: number) => init } } },
    config: { guildId: 'g1' },
    exit: vi.fn(),
    ...over,
  } as any;
  return { deps, setPresence };
}

function app(deps: any) {
  const a = express();
  a.use(express.json());
  a.use('/api/bot', createBotRouter(deps));
  return a;
}

beforeEach(() => {
  getSettings.mockReset().mockResolvedValue(row);
  updateSettings.mockReset().mockImplementation((_g: string, data: any) => Promise.resolve({ ...row, ...data }));
});

describe('bot router', () => {
  it('GET /presence returns the stored config + allowed types', async () => {
    const { deps } = fakeDeps();
    const res = await request(app(deps)).get('/api/bot/presence').expect(200);
    expect(res.body.types).toContain('streaming');
  });

  it('PUT /presence saves a valid watching status and applies it live', async () => {
    const { deps, setPresence } = fakeDeps();
    const res = await request(app(deps)).put('/api/bot/presence').send({ type: 'watching', text: 'مرحبا' }).expect(200);
    expect(updateSettings).toHaveBeenCalledWith('g1', {
      botPresenceType: 'watching',
      botPresenceText: 'مرحبا',
      botPresenceUrl: null,
    });
    expect(res.body).toMatchObject({ type: 'watching', text: 'مرحبا' });
    expect(setPresence).toHaveBeenCalledTimes(1);
  });

  it('PUT /presence 400s on streaming without a twitch/youtube url (and does not apply)', async () => {
    const { deps, setPresence } = fakeDeps();
    await request(app(deps)).put('/api/bot/presence').send({ type: 'streaming', text: 'x', url: 'https://example.com' }).expect(400);
    expect(setPresence).not.toHaveBeenCalled();
  });

  it('POST /restart responds ok then triggers a process exit', async () => {
    const exit = vi.fn();
    const { deps } = fakeDeps({ exit });
    await request(app(deps)).post('/api/bot/restart').expect(200);
    await new Promise((r) => setTimeout(r, 350));
    expect(exit).toHaveBeenCalledWith(0);
  });
});
