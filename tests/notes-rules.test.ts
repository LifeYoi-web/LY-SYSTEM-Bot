import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---- notes route ----

import { createNotesRouter } from '../src/api/routes/notes';

function notesDeps() {
  return {
    config: { guildId: 'g1' },
    prisma: {
      memberNote: {
        findMany: vi.fn().mockResolvedValue([{ id: 'n1', guildId: 'g1', userId: 'u1', authorId: 'a1', content: 'hi', createdAt: new Date() }]),
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'n2', ...data, createdAt: new Date() })),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    },
  } as any;
}
function notesApp(d: any) {
  const a = express();
  a.use(express.json());
  a.use('/api/notes', createNotesRouter(d));
  return a;
}

describe('notes route', () => {
  it('GET / returns notes for the guild', async () => {
    const res = await request(notesApp(notesDeps())).get('/api/notes').expect(200);
    expect(res.body.notes).toHaveLength(1);
  });
  it('POST / 400s without a userId', async () => {
    await request(notesApp(notesDeps())).post('/api/notes').send({ content: 'x' }).expect(400);
  });
  it('POST / 400s without content', async () => {
    await request(notesApp(notesDeps())).post('/api/notes').send({ userId: 'u1' }).expect(400);
  });
  it('POST / 400s on a too-long content', async () => {
    await request(notesApp(notesDeps())).post('/api/notes').send({ userId: 'u1', content: 'x'.repeat(1001) }).expect(400);
  });
  it('POST / creates a note', async () => {
    const res = await request(notesApp(notesDeps())).post('/api/notes').send({ userId: 'u1', content: 'watch them' }).expect(201);
    expect(res.body.content).toBe('watch them');
  });
  it('DELETE /:id 404s when missing', async () => {
    const d = notesDeps();
    d.prisma.memberNote.deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    await request(notesApp(d)).delete('/api/notes/zzz').expect(404);
  });
  it('DELETE /:id removes a note', async () => {
    await request(notesApp(notesDeps())).delete('/api/notes/n1').expect(200);
  });
});

// ---- rules route ----

vi.mock('../src/db/settingsCache', () => {
  const state = {
    rulesEnabled: false,
    rulesChannelId: null as string | null,
    rulesMessage: null as string | null,
    rulesRoleId: null as string | null,
    rulesButtonLabel: null as string | null,
  };
  return {
    getSettings: vi.fn().mockImplementation(() => Promise.resolve({ guildId: 'g1', logChannelId: null, ...state })),
    updateSettings: vi.fn().mockImplementation((_g: string, d: Record<string, unknown>) => {
      Object.assign(state, d);
      return Promise.resolve({ guildId: 'g1', logChannelId: null, ...state });
    }),
  };
});

import { createRulesRouter, buildRulesPanel } from '../src/api/routes/rules';

function rulesApp(channelOk = true) {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue({ id: 'm1' }) };
  const a = express();
  a.use(express.json());
  a.use(
    '/api/rules',
    createRulesRouter({
      client: { channels: { cache: { get: () => (channelOk ? channel : undefined) } } } as any,
      prisma: {} as any,
      config: { guildId: 'g1' },
    }),
  );
  return { app: a, channel };
}

describe('buildRulesPanel', () => {
  it('uses the rules:accept custom id', () => {
    const panel = buildRulesPanel('# قوانين', 'موافق');
    expect(JSON.stringify(panel.components)).toContain('rules:accept');
    expect(JSON.stringify(panel.components)).toContain('موافق');
  });
});

describe('rules route', () => {
  it('GET / returns rules config keys only', async () => {
    const { app } = rulesApp();
    const res = await request(app).get('/api/rules').expect(200);
    expect(res.body).toHaveProperty('rulesEnabled');
    expect(res.body).not.toHaveProperty('guildId');
  });
  it('PUT / persists fields and rejects oversize message', async () => {
    const { app } = rulesApp();
    await request(app).put('/api/rules').send({ rulesMessage: 'x'.repeat(2001) }).expect(400);
    const res = await request(app)
      .put('/api/rules')
      .send({ rulesEnabled: true, rulesMessage: 'قوانين', rulesRoleId: 'r1', rulesButtonLabel: 'موافق' })
      .expect(200);
    expect(res.body.rulesEnabled).toBe(true);
    expect(res.body.rulesRoleId).toBe('r1');
  });
  it('POST /post 400s without channelId', async () => {
    const { app } = rulesApp();
    await request(app).post('/api/rules/post').send({}).expect(400);
  });
  it('POST /post posts the panel after config exists', async () => {
    // The prior PUT in this suite has already set rulesMessage + rulesRoleId.
    const { app, channel } = rulesApp();
    await request(app).post('/api/rules/post').send({ channelId: 'c1' }).expect(200);
    expect(channel.send).toHaveBeenCalled();
  });
});
