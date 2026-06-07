import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// planLimit calls getPlan which reads the singleton prisma.subscription — mock it
// so this test stays isolated. plan: 'custom' → Infinity → count check always passes.
const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn().mockResolvedValue({ plan: 'custom' }) } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

// The tickets route reads config/types through the cached community helpers (backed by the
// prisma singleton), so stub that module to keep the route DB-free in tests.
vi.mock('../src/db/community', () => ({
  getTicketConfig: vi.fn().mockResolvedValue({
    guildId: 'g1',
    enabled: true,
    categoryId: null,
    supportRoleId: null,
    openMessage: null,
    counter: 0,
    transcriptChannelId: null,
    dmOnOpen: true,
    dmOnClose: true,
  }),
  updateTicketConfig: vi.fn().mockImplementation((g: string, d: Record<string, unknown>) => Promise.resolve({ guildId: g, ...d })),
  getTicketTypes: vi.fn().mockResolvedValue([]),
  invalidateTicketTypes: vi.fn(),
  invalidateTicketConfig: vi.fn(),
}));

import { createTicketsRouter } from '../src/api/routes/tickets';

function deps() {
  const channel = { isTextBased: () => true, send: vi.fn().mockResolvedValue({ id: 'm1' }) };
  return {
    config: { guildId: 'g1' },
    client: {
      channels: { cache: { get: () => channel } },
      guilds: { cache: { get: () => undefined } },
    },
    prisma: {
      ticket: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketTranscript: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketType: {
        create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ty1', ...data })),
        update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ty1', ...data })),
        delete: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
    },
  } as any;
}
function app(d: any) {
  const a = express();
  a.use(express.json());
  a.use('/api/tickets', createTicketsRouter(d));
  return a;
}

describe('tickets route', () => {
  it('GET / returns config, types, open and closed tickets', async () => {
    const res = await request(app(deps())).get('/api/tickets').expect(200);
    expect(res.body).toHaveProperty('config');
    expect(res.body).toHaveProperty('types');
    expect(res.body).toHaveProperty('tickets');
    expect(res.body).toHaveProperty('closed');
  });

  it('POST /types 400s without a label', async () => {
    await request(app(deps())).post('/api/tickets/types').send({}).expect(400);
  });

  it('POST /types creates a type', async () => {
    const res = await request(app(deps())).post('/api/tickets/types').send({ label: 'دعم' }).expect(201);
    expect(res.body.label).toBe('دعم');
  });

  it('DELETE /types/:id succeeds', async () => {
    await request(app(deps())).delete('/api/tickets/types/ty1').expect(200);
  });

  it('PUT /config rejects a too-long openMessage', async () => {
    await request(app(deps())).put('/api/tickets/config').send({ openMessage: 'x'.repeat(1001) }).expect(400);
  });

  it('POST /panel 400s without a channelId', async () => {
    await request(app(deps())).post('/api/tickets/panel').send({}).expect(400);
  });

  it('POST /panel posts a panel to the channel', async () => {
    const d = deps();
    await request(app(d)).post('/api/tickets/panel').send({ channelId: 'c1' }).expect(200);
    expect(d.client.channels.cache.get().send).toHaveBeenCalled();
  });

  it('POST /:id/close 404s when there is no matching open ticket', async () => {
    await request(app(deps())).post('/api/tickets/abc/close').expect(404);
  });

  it('GET /transcripts/:id 404s when the transcript is missing', async () => {
    await request(app(deps())).get('/api/tickets/transcripts/zzz').expect(404);
  });

  it('GET /transcripts/:id serves the stored HTML', async () => {
    const d = deps();
    d.prisma.ticketTranscript.findFirst = vi.fn().mockResolvedValue({ id: 'tr1', html: '<html>hi</html>' });
    const res = await request(app(d)).get('/api/tickets/transcripts/tr1').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('hi');
  });
});
