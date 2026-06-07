import express, { type Express } from 'express';
import session, { type Store } from 'express-session';
import helmet from 'helmet';
import connectPgSimple from 'connect-pg-simple';
import { join } from 'path';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../shared/config';
import { logger } from '../shared/logger';
import { createAuthRouter } from './routes/auth';
import { createOverviewRouter } from './routes/overview';
import { createMembersRouter } from './routes/members';
import { createModerationRouter } from './routes/moderation';
import { createSettingsRouter } from './routes/settings';
import { createAutoModRouter } from './routes/automod';
import { createLogsRouter } from './routes/logs';
import { createAnalyticsRouter } from './routes/analytics';
import { createServerRouter } from './routes/server';
import { createLevelingRouter } from './routes/leveling';
import { createRolePanelsRouter } from './routes/rolepanels';
import { createAnnounceRouter } from './routes/announce';
import { createAutoRespondersRouter } from './routes/autoresponders';
import { createScheduledRouter } from './routes/scheduled';
import { createTicketsRouter } from './routes/tickets';
import { createGiveawaysRouter } from './routes/giveaways';
import { createStarboardRouter } from './routes/starboard';
import { createSuggestionsRouter } from './routes/suggestions';
import { createBirthdaysRouter } from './routes/birthdays';
import { createTagsRouter } from './routes/tags';
import { createStickyRouter } from './routes/sticky';
import { createCountingRouter } from './routes/counting';
import { createStatCountersRouter } from './routes/statcounters';
import { createRemindersRouter } from './routes/reminders';
import { createReportRouter } from './routes/report';
import { createTempVoiceRouter } from './routes/tempvoice';
import { createNotesRouter } from './routes/notes';
import { createRulesRouter } from './routes/rules';
import { createBotRouter } from './routes/bot';
import { createCreatorAnnounceRouter } from './routes/creatorannounce';
import { createInvitesRouter } from './routes/invites';
import { createRaidRouter } from './routes/raid';
import { createEconomyRouter } from './routes/economy';
import { createShopRouter } from './routes/shop';
import { createEmbedsRouter } from './routes/embeds';
import { createApplicationsRouter } from './routes/applications';
import { createStaffReportRouter } from './routes/staffreport';
import { createDigestRouter } from './routes/digest';
import { createBoostersRouter } from './routes/boosters';
import { createAlertsRouter } from './routes/alerts';
import { createEntitlementsRouter } from './routes/entitlements';
import { requireStaff } from './middleware/requireStaff';
import { requireFeature } from './middleware/entitlements';
import { rateLimit } from './middleware/rateLimit';
import { tenantContext, tenantGuildId } from './middleware/tenant';
import { requireOwner } from './middleware/requireOwner';

export interface ApiDeps {
  client: Client;
  prisma: PrismaClient;
  config: AppConfig;
  sessionStore?: Store;
}

export function createApp(deps: ApiDeps): Express {
  const app = express();
  app.set('trust proxy', 1); // Railway terminates TLS at a proxy; needed for secure cookies + req.ip
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Discord CDN serves member/guild avatars; the default img-src ('self' data:) blocks them.
          'img-src': ["'self'", 'data:', 'https://cdn.discordapp.com'],
        },
      },
    }),
  );
  // The welcome-card background upload is base64 data (cap ~1.5 MB binary ≈ 2 MB string),
  // so the body parser needs headroom over the 100kb default.
  app.use(express.json({ limit: '4mb' }));

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store:
        deps.sessionStore ??
        new PgStore({ conString: deps.config.databaseUrl, createTableIfMissing: true }),
      secret: deps.config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: deps.config.isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', createAuthRouter(deps));

  // Tenant middleware: validates the session-selected guild and attaches req.tenant.
  // Built once; injected after requireStaff() on every non-auth, non-health, non-bot route.
  // /api/bot is intentionally excluded — bot routes are global (presence/restart are not
  // per-guild) and read settings via config.guildId (the owner guild's row). requireOwner
  // gates it instead.
  const tenant = tenantContext(deps.config);

  // Everything below requires an authorized staff session + tenant resolution.
  app.use('/api/overview', requireStaff(), tenant, createOverviewRouter(deps));
  app.use('/api/analytics', requireStaff(), tenant, createAnalyticsRouter(deps));
  app.use('/api/members', requireStaff(), tenant, createMembersRouter(deps));
  app.use('/api/server', requireStaff(), tenant, createServerRouter(deps));
  app.use('/api/logs', requireStaff(), tenant, createLogsRouter(deps));
  app.use(
    '/api/moderation',
    requireStaff(),
    tenant,
    rateLimit({ windowMs: 60_000, max: 30 }),
    createModerationRouter(deps),
  );
  app.use('/api/settings', requireStaff(), tenant, createSettingsRouter({ client: deps.client, config: deps.config }));
  app.use('/api/automod', requireStaff(), tenant, createAutoModRouter({ config: deps.config }));
  app.use('/api/leveling', requireStaff(), tenant, createLevelingRouter(deps));
  app.use('/api/rolepanels', requireStaff(), tenant, createRolePanelsRouter(deps));
  app.use('/api/announce', requireStaff(), tenant, rateLimit({ windowMs: 60_000, max: 20 }), createAnnounceRouter(deps));
  app.use('/api/autoresponders', requireStaff(), tenant, createAutoRespondersRouter(deps));
  app.use('/api/scheduled', requireStaff(), tenant, createScheduledRouter(deps));
  app.use('/api/tickets', requireStaff(), tenant, createTicketsRouter(deps));
  app.use('/api/giveaways', requireStaff(), tenant, createGiveawaysRouter(deps));
  app.use('/api/starboard', requireStaff(), tenant, createStarboardRouter(deps));
  app.use('/api/suggestions', requireStaff(), tenant, createSuggestionsRouter(deps));
  app.use('/api/birthdays', requireStaff(), tenant, createBirthdaysRouter(deps));
  app.use('/api/tags', requireStaff(), tenant, createTagsRouter(deps));
  app.use('/api/sticky', requireStaff(), tenant, createStickyRouter(deps));
  app.use('/api/counting', requireStaff(), tenant, createCountingRouter(deps));
  app.use('/api/statcounters', requireStaff(), tenant, createStatCountersRouter(deps));
  app.use('/api/reminders', requireStaff(), tenant, createRemindersRouter(deps));
  app.use('/api/report', requireStaff(), tenant, createReportRouter(deps));
  app.use('/api/tempvoice', requireStaff(), tenant, requireFeature('tempVoice', (req) => tenantGuildId(req)), createTempVoiceRouter(deps));
  app.use('/api/notes', requireStaff(), tenant, createNotesRouter(deps));
  app.use('/api/rules', requireStaff(), tenant, createRulesRouter(deps));
  // /api/bot: owner-only + no tenant middleware (global bot routes, reads owner guild's settings row)
  app.use('/api/bot', requireStaff(), requireOwner(deps.config), createBotRouter({ client: deps.client, config: deps.config }));
  app.use(
    '/api/creatorannounce',
    requireStaff(),
    tenant,
    requireFeature('creatorAlerts', (req) => tenantGuildId(req)),
    rateLimit({ windowMs: 60_000, max: 20 }),
    createCreatorAnnounceRouter(deps),
  );
  app.use('/api/invites', requireStaff(), tenant, createInvitesRouter(deps));
  app.use('/api/raid', requireStaff(), tenant, createRaidRouter(deps));
  app.use('/api/economy', requireStaff(), tenant, createEconomyRouter(deps));
  app.use('/api/shop', requireStaff(), tenant, createShopRouter(deps));
  app.use('/api/embeds', requireStaff(), tenant, rateLimit({ windowMs: 60_000, max: 30 }), createEmbedsRouter(deps));
  app.use('/api/applications', requireStaff(), tenant, createApplicationsRouter(deps));
  app.use('/api/staffreport', requireStaff(), tenant, createStaffReportRouter(deps));
  app.use('/api/digest', requireStaff(), tenant, createDigestRouter(deps));
  app.use('/api/boosters', requireStaff(), tenant, createBoostersRouter(deps));
  app.use('/api/alerts', requireStaff(), tenant, createAlertsRouter(deps));
  app.use('/api/entitlements', requireStaff(), tenant, createEntitlementsRouter({ config: deps.config }));

  const webDist = join(__dirname, '..', '..', 'web', 'dist');
  app.use(express.static(webDist));
  // SPA fallback. Uses app.use (not app.get('*')) so it works on both Express 4 and 5.
  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.sendFile(join(webDist, 'index.html'));
  });

  return app;
}

export function startApiServer(deps: ApiDeps): void {
  const app = createApp(deps);
  app.listen(deps.config.port, () =>
    logger.success(`Dashboard API listening on :${deps.config.port}`),
  );
}
