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
import { requireStaff } from './middleware/requireStaff';
import { rateLimit } from './middleware/rateLimit';

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

  // Everything below requires an authorized staff session.
  app.use('/api/overview', requireStaff(), createOverviewRouter(deps));
  app.use('/api/analytics', requireStaff(), createAnalyticsRouter(deps));
  app.use('/api/members', requireStaff(), createMembersRouter(deps));
  app.use('/api/server', requireStaff(), createServerRouter(deps));
  app.use('/api/logs', requireStaff(), createLogsRouter(deps));
  app.use(
    '/api/moderation',
    requireStaff(),
    rateLimit({ windowMs: 60_000, max: 30 }),
    createModerationRouter(deps),
  );
  app.use('/api/settings', requireStaff(), createSettingsRouter({ config: deps.config }));
  app.use('/api/automod', requireStaff(), createAutoModRouter({ config: deps.config }));
  app.use('/api/leveling', requireStaff(), createLevelingRouter(deps));
  app.use('/api/rolepanels', requireStaff(), createRolePanelsRouter(deps));
  app.use('/api/announce', requireStaff(), rateLimit({ windowMs: 60_000, max: 20 }), createAnnounceRouter(deps));
  app.use('/api/autoresponders', requireStaff(), createAutoRespondersRouter(deps));
  app.use('/api/scheduled', requireStaff(), createScheduledRouter(deps));
  app.use('/api/tickets', requireStaff(), createTicketsRouter(deps));
  app.use('/api/giveaways', requireStaff(), createGiveawaysRouter(deps));
  app.use('/api/starboard', requireStaff(), createStarboardRouter(deps));
  app.use('/api/suggestions', requireStaff(), createSuggestionsRouter(deps));
  app.use('/api/birthdays', requireStaff(), createBirthdaysRouter(deps));
  app.use('/api/tags', requireStaff(), createTagsRouter(deps));
  app.use('/api/sticky', requireStaff(), createStickyRouter(deps));
  app.use('/api/counting', requireStaff(), createCountingRouter(deps));
  app.use('/api/statcounters', requireStaff(), createStatCountersRouter(deps));
  app.use('/api/reminders', requireStaff(), createRemindersRouter(deps));
  app.use('/api/report', requireStaff(), createReportRouter(deps));
  app.use('/api/tempvoice', requireStaff(), createTempVoiceRouter(deps));
  app.use('/api/notes', requireStaff(), createNotesRouter(deps));
  app.use('/api/rules', requireStaff(), createRulesRouter(deps));
  app.use('/api/bot', requireStaff(), createBotRouter({ client: deps.client, config: deps.config }));
  app.use(
    '/api/creatorannounce',
    requireStaff(),
    rateLimit({ windowMs: 60_000, max: 20 }),
    createCreatorAnnounceRouter(deps),
  );
  app.use('/api/invites', requireStaff(), createInvitesRouter(deps));
  app.use('/api/raid', requireStaff(), createRaidRouter(deps));
  app.use('/api/economy', requireStaff(), createEconomyRouter(deps));
  app.use('/api/shop', requireStaff(), createShopRouter(deps));
  app.use('/api/embeds', requireStaff(), rateLimit({ windowMs: 60_000, max: 30 }), createEmbedsRouter(deps));
  app.use('/api/applications', requireStaff(), createApplicationsRouter(deps));
  app.use('/api/staffreport', requireStaff(), createStaffReportRouter(deps));
  app.use('/api/digest', requireStaff(), createDigestRouter(deps));
  app.use('/api/boosters', requireStaff(), createBoostersRouter(deps));
  app.use('/api/alerts', requireStaff(), createAlertsRouter(deps));

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
