/**
 * Cross-tenant channel security — A2 security regression tests.
 *
 * The shared bot sits in N guilds. Without the channel ownership gate, a staff
 * member of guild B could supply a channelId belonging to guild A and make the
 * bot write into that channel. These tests verify:
 *   - Layer 1 (direct-send sites): foreign channel → 400, send() never called.
 *   - Layer 2 (config-save sites): foreign channelId in payload → 400, db never written.
 *
 * Channel fake shape:
 *   { guildId, isTextBased: () => true }  — text channel of a specific guild.
 * The cache Map is keyed by channelId:
 *   'ch-own'   → belongs to guildId 'g1'   (tenant's own channel)
 *   'ch-other' → belongs to guildId 'g-OTHER' (foreign channel)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

// planLimit / subscription gate — stub globally so channel tests don't hit the db.
const { fakePrisma } = vi.hoisted(() => ({
  fakePrisma: { subscription: { findUnique: vi.fn().mockResolvedValue({ plan: 'custom' }) } },
}));
vi.mock('../src/db/prisma', () => ({ prisma: fakePrisma }));

// Also stub planLimit and requireFeature directly so the entitlements middleware never hits real DB.
vi.mock('../src/api/middleware/entitlements', () => ({
  planLimit: vi.fn().mockResolvedValue(Infinity),
  requireFeature: vi.fn().mockImplementation(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Community caches used by tickets / sticky / suggestions routers.
vi.mock('../src/db/community', () => ({
  getTicketConfig: vi.fn().mockResolvedValue({ enabled: true, categoryId: null, supportRoleId: null, openMessage: null, counter: 0, transcriptChannelId: null, dmOnOpen: true, dmOnClose: true }),
  updateTicketConfig: vi.fn(),
  getTicketTypes: vi.fn().mockResolvedValue([]),
  invalidateTicketTypes: vi.fn(),
  invalidateSticky: vi.fn(),
  getSuggestionConfig: vi.fn().mockResolvedValue({ enabled: true, channelId: null }),
  updateSuggestionConfig: vi.fn().mockResolvedValue({ enabled: true, channelId: null }),
  getStarboard: vi.fn().mockResolvedValue({ channelId: null }),
  updateStarboard: vi.fn().mockResolvedValue({ channelId: null }),
  getBirthdayConfig: vi.fn().mockResolvedValue({ channelId: null }),
  updateBirthdayConfig: vi.fn().mockResolvedValue({ channelId: null }),
  getReportConfig: vi.fn().mockResolvedValue({ channelId: null }),
  updateReportConfig: vi.fn().mockResolvedValue({ channelId: null }),
  getAlertConfig: vi.fn().mockResolvedValue({ alertChannelId: null }),
  updateAlertConfig: vi.fn().mockResolvedValue({ alertChannelId: null }),
  getCounting: vi.fn().mockResolvedValue({ channelId: null }),
  updateCounting: vi.fn().mockResolvedValue({ channelId: null }),
  getRaidConfig: vi.fn().mockResolvedValue({ alertChannelId: null }),
  updateRaidConfig: vi.fn().mockResolvedValue({ alertChannelId: null }),
}));

vi.mock('../src/db/settingsCache', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  updateSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/db/leveling', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, getLevelConfig: vi.fn().mockResolvedValue({}), updateLevelConfig: vi.fn().mockResolvedValue({}) };
});

// applications bot helpers
vi.mock('../src/bot/applications', () => ({
  applyPanelEmbed: vi.fn().mockReturnValue({}),
  applyButtonRow: vi.fn().mockReturnValue({}),
}));

// rolepanels bot helpers (buildPanelMessage is exported directly, not mocked)
// tickets bot helpers
vi.mock('../src/bot/tickets', () => ({
  buildTicketPanel: vi.fn().mockReturnValue({}),
  closeTicket: vi.fn(),
  reopenTicket: vi.fn(),
}));

// bot/welcomeCard for settings
vi.mock('../src/bot/welcomeCard', () => ({
  WELCOME_CARD_STYLE_KEYS: ['classic'],
}));

// subscriptions for settings premium gate
vi.mock('../src/db/subscriptions', () => ({
  getPlan: vi.fn().mockResolvedValue('free'),
}));

// entitlements
vi.mock('../src/shared/entitlements', () => ({
  hasFeature: vi.fn().mockReturnValue(true),
}));

import { createAnnounceRouter } from '../src/api/routes/announce';
import { createRolePanelsRouter } from '../src/api/routes/rolepanels';
import { createTicketsRouter } from '../src/api/routes/tickets';
import { createApplicationsRouter } from '../src/api/routes/applications';
import { createSettingsRouter } from '../src/api/routes/settings';
import { createStatCountersRouter } from '../src/api/routes/statcounters';
import { createSuggestionsRouter } from '../src/api/routes/suggestions';
import { createStarboardRouter } from '../src/api/routes/starboard';
import { createBirthdaysRouter } from '../src/api/routes/birthdays';
import { createReportRouter } from '../src/api/routes/report';
import { createAlertsRouter } from '../src/api/routes/alerts';
import { createRaidRouter } from '../src/api/routes/raid';
import { createLevelingRouter } from '../src/api/routes/leveling';
import { createCountingRouter } from '../src/api/routes/counting';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const OWNED_CHANNEL = 'ch-own';
const FOREIGN_CHANNEL = 'ch-other';
const TENANT_GUILD = 'g1';
const OTHER_GUILD = 'g-OTHER';

/**
 * Build a minimal fake Discord client whose channel cache contains:
 *   ch-own   → text channel of g1
 *   ch-other → text channel of g-OTHER
 */
function makeClient() {
  const cache = new Map<string, { guildId: string; isTextBased: () => boolean; send: ReturnType<typeof vi.fn> }>([
    [OWNED_CHANNEL, { guildId: TENANT_GUILD, isTextBased: () => true, send: vi.fn().mockResolvedValue({ id: 'msg1' }) }],
    [FOREIGN_CHANNEL, { guildId: OTHER_GUILD, isTextBased: () => true, send: vi.fn().mockResolvedValue({ id: 'msg2' }) }],
  ]);
  return {
    channels: { cache },
    guilds: { cache: new Map() },
  };
}

/** Build an Express app scoped to tenant 'g1'. */
function makeApp(router: Express['_router'], prefix: string): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenant = { guildId: TENANT_GUILD };
    next();
  });
  app.use(prefix, router as any);
  return app;
}

// ---------------------------------------------------------------------------
// Layer 1 — direct-send sites
// ---------------------------------------------------------------------------

describe('Layer 1: announce POST / — channel ownership gate', () => {
  it('returns 400 and never calls send for a foreign channel', async () => {
    const client = makeClient();
    const app = makeApp(
      createAnnounceRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/announce',
    );
    const res = await request(app)
      .post('/api/announce')
      .send({ channelId: FOREIGN_CHANNEL, content: 'hello' })
      .expect(400);
    expect(res.body.error).toBe('invalid channel');
    expect(client.channels.cache.get(FOREIGN_CHANNEL)!.send).not.toHaveBeenCalled();
  });

  it('succeeds and calls send for an owned channel', async () => {
    const client = makeClient();
    const app = makeApp(
      createAnnounceRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/announce',
    );
    await request(app)
      .post('/api/announce')
      .send({ channelId: OWNED_CHANNEL, content: 'hello' })
      .expect(201);
    expect(client.channels.cache.get(OWNED_CHANNEL)!.send).toHaveBeenCalled();
  });
});

describe('Layer 1: rolepanels POST /:id/post — channel ownership gate', () => {
  function makeRpPrisma(guildId: string) {
    return {
      rolePanel: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ id: 'rp1', guildId, title: 'T', description: null, roles: [] }),
        update: vi.fn().mockResolvedValue({ id: 'rp1', guildId }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  it('returns 400 and never calls send for a foreign channel', async () => {
    const client = makeClient();
    const app = makeApp(
      createRolePanelsRouter({ client: client as any, prisma: makeRpPrisma(TENANT_GUILD) as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/rp',
    );
    const res = await request(app)
      .post('/api/rp/rp1/post')
      .send({ channelId: FOREIGN_CHANNEL })
      .expect(400);
    expect(res.body.error).toBe('invalid channel');
    expect(client.channels.cache.get(FOREIGN_CHANNEL)!.send).not.toHaveBeenCalled();
  });

  it('succeeds and calls send for an owned channel', async () => {
    const client = makeClient();
    const app = makeApp(
      createRolePanelsRouter({ client: client as any, prisma: makeRpPrisma(TENANT_GUILD) as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/rp',
    );
    await request(app)
      .post('/api/rp/rp1/post')
      .send({ channelId: OWNED_CHANNEL })
      .expect(200);
    expect(client.channels.cache.get(OWNED_CHANNEL)!.send).toHaveBeenCalled();
  });
});

describe('Layer 1: tickets POST /panel — channel ownership gate', () => {
  function makeTicketPrisma() {
    return {
      ticket: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
      ticketTranscript: { findMany: vi.fn().mockResolvedValue([]) },
      ticketType: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    };
  }

  it('returns 400 and never calls send for a foreign channel', async () => {
    const client = makeClient();
    const app = makeApp(
      createTicketsRouter({ client: client as any, prisma: makeTicketPrisma() as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/tickets',
    );
    const res = await request(app)
      .post('/api/tickets/panel')
      .send({ channelId: FOREIGN_CHANNEL })
      .expect(400);
    expect(res.body.error).toBe('invalid channel');
    expect(client.channels.cache.get(FOREIGN_CHANNEL)!.send).not.toHaveBeenCalled();
  });

  it('succeeds and calls send for an owned channel', async () => {
    const client = makeClient();
    const app = makeApp(
      createTicketsRouter({ client: client as any, prisma: makeTicketPrisma() as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/tickets',
    );
    await request(app)
      .post('/api/tickets/panel')
      .send({ channelId: OWNED_CHANNEL })
      .expect(200);
    expect(client.channels.cache.get(OWNED_CHANNEL)!.send).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — config-save sites
// ---------------------------------------------------------------------------

describe('Layer 2: settings PUT / welcomeChannelId — channel ownership gate', () => {
  function makeSettingsApp() {
    const client = makeClient();
    const app = makeApp(
      createSettingsRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/settings',
    );
    return { client, app };
  }

  it('returns 400 for a foreign welcomeChannelId', async () => {
    const { app } = makeSettingsApp();
    const res = await request(app)
      .put('/api/settings')
      .send({ welcomeChannelId: FOREIGN_CHANNEL })
      .expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned welcomeChannelId', async () => {
    const { app } = makeSettingsApp();
    await request(app)
      .put('/api/settings')
      .send({ welcomeChannelId: OWNED_CHANNEL })
      .expect(200);
  });

  it('returns 400 for a foreign logChannelId', async () => {
    const { app } = makeSettingsApp();
    const res = await request(app)
      .put('/api/settings')
      .send({ logChannelId: FOREIGN_CHANNEL })
      .expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned logChannelId', async () => {
    const { app } = makeSettingsApp();
    await request(app)
      .put('/api/settings')
      .send({ logChannelId: OWNED_CHANNEL })
      .expect(200);
  });
});

describe('Layer 2: statcounters POST / channelId — channel ownership gate', () => {
  function makeScApp() {
    const client = makeClient();
    const prisma = {
      statCounter: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 'sc1', guildId: TENANT_GUILD, channelId: OWNED_CHANNEL, type: 'members', template: '{count}' }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const app = makeApp(
      createStatCountersRouter({ client: client as any, prisma: prisma as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/sc',
    );
    return { client, prisma, app };
  }

  it('returns 400 for a foreign channelId', async () => {
    const { app, prisma } = makeScApp();
    const res = await request(app)
      .post('/api/sc')
      .send({ channelId: FOREIGN_CHANNEL, type: 'members' })
      .expect(400);
    expect(res.body.error).toBe('invalid channel');
    expect(prisma.statCounter.create).not.toHaveBeenCalled();
  });

  it('succeeds for an owned channelId', async () => {
    const { app, prisma } = makeScApp();
    await request(app)
      .post('/api/sc')
      .send({ channelId: OWNED_CHANNEL, type: 'members' })
      .expect(201);
    expect(prisma.statCounter.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Additional Layer 2 spot-checks
// ---------------------------------------------------------------------------

describe('Layer 2: suggestions PUT /config channelId — channel ownership gate', () => {
  it('returns 400 for a foreign channelId', async () => {
    const client = makeClient();
    const prisma = {
      suggestion: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn() },
    };
    const app = makeApp(
      createSuggestionsRouter({ client: client as any, prisma: prisma as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/sug',
    );
    const res = await request(app)
      .put('/api/sug/config')
      .send({ channelId: FOREIGN_CHANNEL })
      .expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned channelId', async () => {
    const client = makeClient();
    const prisma = {
      suggestion: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn() },
    };
    const app = makeApp(
      createSuggestionsRouter({ client: client as any, prisma: prisma as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/sug',
    );
    await request(app)
      .put('/api/sug/config')
      .send({ channelId: OWNED_CHANNEL })
      .expect(200);
  });
});

describe('Layer 2: starboard PUT / channelId — channel ownership gate', () => {
  it('returns 400 for a foreign channelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createStarboardRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/sb',
    );
    const res = await request(app).put('/api/sb').send({ channelId: FOREIGN_CHANNEL }).expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned channelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createStarboardRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/sb',
    );
    await request(app).put('/api/sb').send({ channelId: OWNED_CHANNEL }).expect(200);
  });
});

describe('Layer 2: leveling PUT / levelUpChannelId — channel ownership gate', () => {
  it('returns 400 for a foreign levelUpChannelId', async () => {
    const client = makeClient();
    const prisma = {
      memberLevel: { findMany: vi.fn().mockResolvedValue([]) },
      levelRoleReward: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), upsert: vi.fn() },
    };
    const app = makeApp(
      createLevelingRouter({ client: client as any, prisma: prisma as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/lev',
    );
    const res = await request(app).put('/api/lev').send({ levelUpChannelId: FOREIGN_CHANNEL }).expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned levelUpChannelId', async () => {
    const client = makeClient();
    const prisma = {
      memberLevel: { findMany: vi.fn().mockResolvedValue([]) },
      levelRoleReward: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(), upsert: vi.fn() },
    };
    const app = makeApp(
      createLevelingRouter({ client: client as any, prisma: prisma as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/lev',
    );
    await request(app).put('/api/lev').send({ levelUpChannelId: OWNED_CHANNEL }).expect(200);
  });
});

describe('Layer 2: alerts PUT / alertChannelId — channel ownership gate', () => {
  it('returns 400 for a foreign alertChannelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createAlertsRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/alerts',
    );
    const res = await request(app).put('/api/alerts').send({ alertChannelId: FOREIGN_CHANNEL }).expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned alertChannelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createAlertsRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/alerts',
    );
    await request(app).put('/api/alerts').send({ alertChannelId: OWNED_CHANNEL }).expect(200);
  });
});

describe('Layer 2: raid PUT / alertChannelId — channel ownership gate', () => {
  it('returns 400 for a foreign alertChannelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createRaidRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/raid',
    );
    const res = await request(app).put('/api/raid').send({ alertChannelId: FOREIGN_CHANNEL }).expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned alertChannelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createRaidRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/raid',
    );
    await request(app).put('/api/raid').send({ alertChannelId: OWNED_CHANNEL }).expect(200);
  });
});

describe('Layer 2: birthdays PUT /config channelId — channel ownership gate', () => {
  it('returns 400 for a foreign channelId', async () => {
    const client = makeClient();
    const prisma = {
      birthday: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const app = makeApp(
      createBirthdaysRouter({ client: client as any, prisma: prisma as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/bday',
    );
    const res = await request(app).put('/api/bday/config').send({ channelId: FOREIGN_CHANNEL }).expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned channelId', async () => {
    const client = makeClient();
    const prisma = {
      birthday: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const app = makeApp(
      createBirthdaysRouter({ client: client as any, prisma: prisma as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/bday',
    );
    await request(app).put('/api/bday/config').send({ channelId: OWNED_CHANNEL }).expect(200);
  });
});

describe('Layer 2: report PUT / channelId — channel ownership gate', () => {
  it('returns 400 for a foreign channelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createReportRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/report',
    );
    const res = await request(app).put('/api/report').send({ channelId: FOREIGN_CHANNEL }).expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned channelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createReportRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/report',
    );
    await request(app).put('/api/report').send({ channelId: OWNED_CHANNEL }).expect(200);
  });
});

describe('Layer 2: counting PUT / channelId — channel ownership gate', () => {
  it('returns 400 for a foreign channelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createCountingRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/count',
    );
    const res = await request(app).put('/api/count').send({ channelId: FOREIGN_CHANNEL }).expect(400);
    expect(res.body.error).toBe('invalid channel');
  });

  it('succeeds for an owned channelId', async () => {
    const client = makeClient();
    const app = makeApp(
      createCountingRouter({ client: client as any, config: { guildId: TENANT_GUILD } }) as any,
      '/api/count',
    );
    await request(app).put('/api/count').send({ channelId: OWNED_CHANNEL }).expect(200);
  });
});
