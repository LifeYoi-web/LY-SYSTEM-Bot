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
  app.use(express.json());

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
