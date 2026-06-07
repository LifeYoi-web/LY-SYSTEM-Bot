/**
 * Cross-tenant mutation safety — A2b security regression tests.
 *
 * For every handler fixed in the A2b patch: a staffer of guild g1 MUST NOT be
 * able to delete or update a row that belongs to guild g-OTHER.
 *
 * Pattern for deleteMany-based handlers:
 *   - foreign row: deleteMany returns { count: 0 } → 404, no delete executed against foreign data
 *   - owned row:   deleteMany returns { count: 1 } → 200 { ok: true }
 *
 * Pattern for findUnique-then-update handlers:
 *   - foreign row: findUnique returns row with guildId 'g-OTHER' → 404, no update called
 *   - owned row:   findUnique returns row with guildId 'g1' → 200 with updated row
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

// planLimit calls getPlan via the prisma singleton — stub it out globally.
const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn().mockResolvedValue({ plan: 'custom' }) } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

// Ticket route uses cached community helpers backed by the singleton.
vi.mock('../src/db/community', () => ({
  getTicketConfig: vi.fn().mockResolvedValue({ guildId: 'g1', enabled: true, categoryId: null, supportRoleId: null, openMessage: null, counter: 0, transcriptChannelId: null, dmOnOpen: true, dmOnClose: true }),
  updateTicketConfig: vi.fn(),
  getTicketTypes: vi.fn().mockResolvedValue([]),
  invalidateTicketTypes: vi.fn(),
  invalidateTicketConfig: vi.fn(),
}));

// autoresponders cache invalidation
vi.mock('../src/db/autoresponses', () => ({ invalidateAutoResponses: vi.fn() }));

// leveling db helpers
vi.mock('../src/db/leveling', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, getLevelConfig: vi.fn().mockResolvedValue({ guildId: 'g1' }), updateLevelConfig: vi.fn() };
});

import { createTagsRouter } from '../src/api/routes/tags';
import { createAutoRespondersRouter } from '../src/api/routes/autoresponders';
import { createEmbedsRouter } from '../src/api/routes/embeds';
import { createScheduledRouter } from '../src/api/routes/scheduled';
import { createGiveawaysRouter } from '../src/api/routes/giveaways';
import { createRolePanelsRouter } from '../src/api/routes/rolepanels';
import { createShopRouter } from '../src/api/routes/shop';
import { createLevelingRouter } from '../src/api/routes/leveling';
import { createRemindersRouter } from '../src/api/routes/reminders';
import { createStatCountersRouter } from '../src/api/routes/statcounters';
import { createTicketsRouter } from '../src/api/routes/tickets';

/** Build an Express app scoped to tenant 'g1'. */
function makeApp(router: Express['_router'], prefix: string): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenant = { guildId: 'g1' };
    next();
  });
  app.use(prefix, router as any);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers that produce a minimal fake prisma shaped for each router
// ---------------------------------------------------------------------------

const FOREIGN = 'g-OTHER';
const OWNED = 'g1';

// deleteMany pattern: returns { count } depending on ownership
function deleteManyOf(count: number) {
  return vi.fn().mockResolvedValue({ count });
}

// findUnique returns a row with the given guildId (or null)
function findUniqueOf(guildId: string | null) {
  return vi.fn().mockResolvedValue(guildId === null ? null : { id: 'row1', guildId });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
describe('tags DELETE /:id', () => {
  it('404s a foreign-guild row (deleteMany → count 0)', async () => {
    const dm = deleteManyOf(0);
    const prisma = { tag: { deleteMany: dm } };
    const app = makeApp(createTagsRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/tags');
    await request(app).delete('/api/tags/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { tag: { deleteMany: dm } };
    const app = makeApp(createTagsRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/tags');
    const res = await request(app).delete('/api/tags/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AutoResponders
// ---------------------------------------------------------------------------
describe('autoresponders PUT /:id', () => {
  it('404s a foreign-guild row', async () => {
    const fu = findUniqueOf(FOREIGN);
    const update = vi.fn();
    const prisma = { autoResponse: { findUnique: fu, update } };
    const app = makeApp(createAutoRespondersRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/ar');
    await request(app).put('/api/ar/row1').send({ reply: 'x' }).expect(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('200s an owned row', async () => {
    const fu = findUniqueOf(OWNED);
    const update = vi.fn().mockResolvedValue({ id: 'row1', guildId: OWNED, trigger: 'hi', reply: 'x', matchType: 'contains', enabled: true });
    const prisma = { autoResponse: { findUnique: fu, update } };
    const app = makeApp(createAutoRespondersRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/ar');
    await request(app).put('/api/ar/row1').send({ reply: 'x' }).expect(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'row1' } }));
  });
});

describe('autoresponders DELETE /:id', () => {
  it('404s a foreign-guild row', async () => {
    const dm = deleteManyOf(0);
    const prisma = { autoResponse: { deleteMany: dm } };
    const app = makeApp(createAutoRespondersRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/ar');
    await request(app).delete('/api/ar/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { autoResponse: { deleteMany: dm } };
    const app = makeApp(createAutoRespondersRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/ar');
    const res = await request(app).delete('/api/ar/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------
describe('embeds PUT /:id', () => {
  it('404s a foreign-guild row', async () => {
    const fu = findUniqueOf(FOREIGN);
    const update = vi.fn();
    const prisma = { savedEmbed: { findUnique: fu, update } };
    const app = makeApp(createEmbedsRouter({ client: {} as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/embeds');
    await request(app).put('/api/embeds/row1').send({ name: 'new name', payload: { title: 'x' } }).expect(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('200s an owned row', async () => {
    const fu = findUniqueOf(OWNED);
    const update = vi.fn().mockResolvedValue({ id: 'row1', guildId: OWNED, name: 'new name', payload: { title: 'x' } });
    const prisma = { savedEmbed: { findUnique: fu, update } };
    const app = makeApp(createEmbedsRouter({ client: {} as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/embeds');
    await request(app).put('/api/embeds/row1').send({ name: 'new name', payload: { title: 'x' } }).expect(200);
    expect(update).toHaveBeenCalled();
  });
});

describe('embeds DELETE /:id', () => {
  it('404s a foreign-guild row', async () => {
    const dm = deleteManyOf(0);
    const prisma = { savedEmbed: { deleteMany: dm } };
    const app = makeApp(createEmbedsRouter({ client: {} as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/embeds');
    await request(app).delete('/api/embeds/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { savedEmbed: { deleteMany: dm } };
    const app = makeApp(createEmbedsRouter({ client: {} as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/embeds');
    const res = await request(app).delete('/api/embeds/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scheduled messages
// ---------------------------------------------------------------------------
describe('scheduled PUT /:id', () => {
  it('404s a foreign-guild row', async () => {
    const fu = findUniqueOf(FOREIGN);
    const update = vi.fn();
    const prisma = { scheduledMessage: { findUnique: fu, update } };
    const app = makeApp(createScheduledRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/sched');
    await request(app).put('/api/sched/row1').send({ content: 'hi' }).expect(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('200s an owned row', async () => {
    const fu = findUniqueOf(OWNED);
    const update = vi.fn().mockResolvedValue({ id: 'row1', guildId: OWNED, channelId: 'c1', content: 'hi', runAt: new Date(), repeat: 'none' });
    const prisma = { scheduledMessage: { findUnique: fu, update } };
    const app = makeApp(createScheduledRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/sched');
    await request(app).put('/api/sched/row1').send({ content: 'hi' }).expect(200);
    expect(update).toHaveBeenCalled();
  });
});

describe('scheduled DELETE /:id', () => {
  it('404s a foreign-guild row', async () => {
    const dm = deleteManyOf(0);
    const prisma = { scheduledMessage: { deleteMany: dm } };
    const app = makeApp(createScheduledRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/sched');
    await request(app).delete('/api/sched/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { scheduledMessage: { deleteMany: dm } };
    const app = makeApp(createScheduledRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/sched');
    const res = await request(app).delete('/api/sched/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Giveaways
// ---------------------------------------------------------------------------
describe('giveaways DELETE /:id', () => {
  it('404s a foreign-guild row (no Discord side-effect)', async () => {
    const dm = deleteManyOf(0);
    const prisma = { giveaway: { deleteMany: dm } };
    const app = makeApp(
      createGiveawaysRouter({ client: { channels: { cache: { get: vi.fn() } } } as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any,
      '/api/gw',
    );
    await request(app).delete('/api/gw/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { giveaway: { deleteMany: dm } };
    const app = makeApp(
      createGiveawaysRouter({ client: { channels: { cache: { get: vi.fn() } } } as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any,
      '/api/gw',
    );
    const res = await request(app).delete('/api/gw/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Role panels
// ---------------------------------------------------------------------------
describe('rolepanels PUT /:id', () => {
  it('404s a foreign-guild row', async () => {
    const fu = findUniqueOf(FOREIGN);
    const update = vi.fn();
    const prisma = { rolePanel: { findUnique: fu, update } };
    const app = makeApp(
      createRolePanelsRouter({ client: {} as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any,
      '/api/rp',
    );
    await request(app).put('/api/rp/row1').send({ title: 'T' }).expect(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('200s an owned row', async () => {
    const fu = findUniqueOf(OWNED);
    const update = vi.fn().mockResolvedValue({ id: 'row1', guildId: OWNED, title: 'T', description: null, roles: [] });
    const prisma = { rolePanel: { findUnique: fu, update } };
    const app = makeApp(
      createRolePanelsRouter({ client: {} as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any,
      '/api/rp',
    );
    await request(app).put('/api/rp/row1').send({ title: 'T' }).expect(200);
    expect(update).toHaveBeenCalled();
  });
});

describe('rolepanels DELETE /:id', () => {
  it('404s a foreign-guild row', async () => {
    const dm = deleteManyOf(0);
    const prisma = { rolePanel: { deleteMany: dm } };
    const app = makeApp(
      createRolePanelsRouter({ client: {} as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any,
      '/api/rp',
    );
    await request(app).delete('/api/rp/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { rolePanel: { deleteMany: dm } };
    const app = makeApp(
      createRolePanelsRouter({ client: {} as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any,
      '/api/rp',
    );
    const res = await request(app).delete('/api/rp/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shop items
// ---------------------------------------------------------------------------
describe('shop PUT /items/:id', () => {
  it('404s a foreign-guild row', async () => {
    const fu = findUniqueOf(FOREIGN);
    const update = vi.fn();
    const prisma = { shopItem: { findUnique: fu, update } };
    const app = makeApp(createShopRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/shop');
    await request(app).put('/api/shop/items/row1').send({ price: 10 }).expect(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('200s an owned row', async () => {
    const fu = findUniqueOf(OWNED);
    const update = vi.fn().mockResolvedValue({ id: 'row1', guildId: OWNED, roleId: 'r', price: 10, label: null, enabled: true, stock: -1, durationHours: null, requiredLevel: null, position: 0 });
    const prisma = { shopItem: { findUnique: fu, update } };
    const app = makeApp(createShopRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/shop');
    await request(app).put('/api/shop/items/row1').send({ price: 10 }).expect(200);
    expect(update).toHaveBeenCalled();
  });
});

describe('shop DELETE /items/:id', () => {
  it('404s a foreign-guild row', async () => {
    const dm = deleteManyOf(0);
    const prisma = { shopItem: { deleteMany: dm } };
    const app = makeApp(createShopRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/shop');
    await request(app).delete('/api/shop/items/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { shopItem: { deleteMany: dm } };
    const app = makeApp(createShopRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/shop');
    const res = await request(app).delete('/api/shop/items/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Leveling role rewards
// ---------------------------------------------------------------------------
describe('leveling DELETE /rewards/:id', () => {
  it('404s a foreign-guild row', async () => {
    const dm = deleteManyOf(0);
    const prisma = { levelRoleReward: { findMany: vi.fn().mockResolvedValue([]), deleteMany: dm } };
    const app = makeApp(createLevelingRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/lev');
    await request(app).delete('/api/lev/rewards/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { levelRoleReward: { findMany: vi.fn().mockResolvedValue([]), deleteMany: dm } };
    const app = makeApp(createLevelingRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/lev');
    const res = await request(app).delete('/api/lev/rewards/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------
describe('reminders DELETE /:id', () => {
  it('404s a foreign-guild row', async () => {
    const dm = deleteManyOf(0);
    const prisma = { reminder: { deleteMany: dm } };
    const app = makeApp(createRemindersRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/rem');
    await request(app).delete('/api/rem/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { reminder: { deleteMany: dm } };
    const app = makeApp(createRemindersRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/rem');
    const res = await request(app).delete('/api/rem/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stat counters
// ---------------------------------------------------------------------------
describe('statcounters DELETE /:id', () => {
  it('404s a foreign-guild row', async () => {
    const dm = deleteManyOf(0);
    const prisma = { statCounter: { deleteMany: dm } };
    const app = makeApp(createStatCountersRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/sc');
    await request(app).delete('/api/sc/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned row', async () => {
    const dm = deleteManyOf(1);
    const prisma = { statCounter: { deleteMany: dm } };
    const app = makeApp(createStatCountersRouter({ prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/sc');
    const res = await request(app).delete('/api/sc/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ticket types
// ---------------------------------------------------------------------------
describe('tickets PUT /types/:id', () => {
  it('404s a foreign-guild ticketType', async () => {
    const fu = findUniqueOf(FOREIGN);
    const update = vi.fn();
    const prisma = {
      ticket: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketTranscript: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketType: { findUnique: fu, update, create: vi.fn(), deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    };
    const app = makeApp(createTicketsRouter({ client: { channels: { cache: { get: vi.fn() } }, guilds: { cache: { get: vi.fn() } } } as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/tickets');
    await request(app).put('/api/tickets/types/row1').send({ label: 'X' }).expect(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('200s an owned ticketType', async () => {
    const fu = findUniqueOf(OWNED);
    const update = vi.fn().mockResolvedValue({ id: 'row1', guildId: OWNED, label: 'X' });
    const prisma = {
      ticket: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketTranscript: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketType: { findUnique: fu, update, create: vi.fn(), deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    };
    const app = makeApp(createTicketsRouter({ client: { channels: { cache: { get: vi.fn() } }, guilds: { cache: { get: vi.fn() } } } as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/tickets');
    await request(app).put('/api/tickets/types/row1').send({ label: 'X' }).expect(200);
    expect(update).toHaveBeenCalled();
  });
});

describe('tickets DELETE /types/:id', () => {
  it('404s a foreign-guild ticketType', async () => {
    const dm = deleteManyOf(0);
    const prisma = {
      ticket: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketTranscript: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketType: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: dm, count: vi.fn().mockResolvedValue(0) },
    };
    const app = makeApp(createTicketsRouter({ client: { channels: { cache: { get: vi.fn() } }, guilds: { cache: { get: vi.fn() } } } as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/tickets');
    await request(app).delete('/api/tickets/types/row1').expect(404);
    expect(dm).toHaveBeenCalledWith({ where: { id: 'row1', guildId: OWNED } });
  });

  it('200s an owned ticketType', async () => {
    const dm = deleteManyOf(1);
    const prisma = {
      ticket: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketTranscript: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketType: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: dm, count: vi.fn().mockResolvedValue(0) },
    };
    const app = makeApp(createTicketsRouter({ client: { channels: { cache: { get: vi.fn() } }, guilds: { cache: { get: vi.fn() } } } as any, prisma: prisma as any, config: { guildId: 'g1' } }) as any, '/api/tickets');
    const res = await request(app).delete('/api/tickets/types/row1').expect(200);
    expect(res.body.ok).toBe(true);
  });
});
