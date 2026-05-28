import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { applyTemplate, buildControlPanel } from '../src/bot/tempvoice';

describe('applyTemplate', () => {
  it('substitutes the display name into {user}', () => {
    expect(applyTemplate('روم {user}', 'لايف')).toBe('روم لايف');
  });
  it('falls back to a usable name when the template resolves empty', () => {
    expect(applyTemplate('', 'لايف')).toBe('روم لايف');
  });
  it('truncates to Discord\'s channel-name limit', () => {
    expect(applyTemplate('x'.repeat(200), 'n').length).toBeLessThanOrEqual(95);
  });
});

describe('buildControlPanel', () => {
  it('renders the owner panel with the expected custom IDs', () => {
    const panel = buildControlPanel('u1');
    const json = JSON.stringify(panel.components);
    expect(json).toContain('tv:rename');
    expect(json).toContain('tv:togglelock');
    expect(json).toContain('tv:claim');
    expect(json).toContain('tv:limit');
    expect(json).toContain('tv:kick');
  });
  it('mentions the owner in the embed', () => {
    const panel = buildControlPanel('u1');
    expect(JSON.stringify(panel.embeds)).toContain('u1');
  });
});

// ---- route ----

vi.mock('../src/db/community', () => ({
  getTempVoiceConfig: vi.fn().mockResolvedValue({
    guildId: 'g1',
    enabled: false,
    hubChannelId: null,
    categoryId: null,
    nameTemplate: 'روم {user}',
    defaultUserLimit: 0,
    defaultLocked: false,
  }),
  updateTempVoiceConfig: vi.fn().mockImplementation((g: string, d: Record<string, unknown>) => Promise.resolve({ guildId: g, ...d })),
}));

import { createTempVoiceRouter } from '../src/api/routes/tempvoice';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/tempvoice', createTempVoiceRouter({ client: {} as any, prisma: {} as any, config: { guildId: 'g1' } }));
  return a;
}

describe('tempvoice route', () => {
  it('GET / returns the config payload', async () => {
    const res = await request(app()).get('/api/tempvoice').expect(200);
    expect(res.body.config).toMatchObject({ guildId: 'g1', enabled: false });
  });
  it('PUT /config 400s on an empty nameTemplate', async () => {
    await request(app()).put('/api/tempvoice/config').send({ nameTemplate: '' }).expect(400);
  });
  it('PUT /config 400s on a too-long nameTemplate', async () => {
    await request(app()).put('/api/tempvoice/config').send({ nameTemplate: 'x'.repeat(81) }).expect(400);
  });
  it('PUT /config 400s on a defaultUserLimit out of range', async () => {
    await request(app()).put('/api/tempvoice/config').send({ defaultUserLimit: 200 }).expect(400);
    await request(app()).put('/api/tempvoice/config').send({ defaultUserLimit: -1 }).expect(400);
  });
  it('PUT /config persists the happy-path body', async () => {
    const res = await request(app())
      .put('/api/tempvoice/config')
      .send({ enabled: true, hubChannelId: 'c1', nameTemplate: 'مع {user}', defaultUserLimit: 5, defaultLocked: true })
      .expect(200);
    expect(res.body).toMatchObject({ enabled: true, hubChannelId: 'c1', nameTemplate: 'مع {user}', defaultUserLimit: 5, defaultLocked: true });
  });
});
