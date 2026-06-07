import { Router } from 'express';
import { randomBytes } from 'crypto';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { discoverManageableGuilds } from '../auth-utils';
import { getSettings } from '../../db/settingsCache';
import { logger } from '../../shared/logger';

const DISCORD_API = 'https://discord.com/api';

export interface AuthDeps {
  client: Client;
  config: AppConfig;
}

export function createAuthRouter(deps: AuthDeps): Router {
  const { config, client } = deps;
  const router = Router();

  router.get('/login', (req, res) => {
    const state = randomBytes(16).toString('hex');
    req.session.oauthState = state;
    const url = new URL(`${DISCORD_API}/oauth2/authorize`);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.oauthRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  });

  router.get('/callback', async (req, res) => {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    const expectedState = req.session.oauthState;
    delete req.session.oauthState;

    if (!code) return res.redirect(`${config.dashboardUrl}/login?error=nocode`);
    if (!state || state !== expectedState) {
      return res.redirect(`${config.dashboardUrl}/login?error=badstate`);
    }

    try {
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.oauthRedirectUri,
        }),
      });
      if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
      const token = (await tokenRes.json()) as { access_token?: unknown };
      if (typeof token.access_token !== 'string') throw new Error('missing access_token');

      const userRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!userRes.ok) throw new Error(`user fetch failed: ${userRes.status}`);
      const user = (await userRes.json()) as { id: string; username: string; avatar: string | null };

      const manageable = await discoverManageableGuilds(
        client,
        user.id,
        async (gid) => (await getSettings(gid)).staffRoleIds,
      );
      if (manageable.length === 0) return res.redirect(`${config.dashboardUrl}/login?error=forbidden`);
      const guildIds = manageable.map((g) => g.id);
      const selected = guildIds.includes(config.guildId) ? config.guildId : guildIds[0];

      req.session.regenerate((regenErr) => {
        if (regenErr) {
          logger.error(`Session regenerate failed: ${regenErr.message}`);
          return res.redirect(`${config.dashboardUrl}/login?error=oauth`);
        }
        req.session.user = {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          authorized: true,
        };
        req.session.guildIds = guildIds;
        req.session.guildId = selected;
        req.session.save((saveErr) => {
          if (saveErr) {
            logger.error(`Session save failed: ${saveErr.message}`);
            return res.redirect(`${config.dashboardUrl}/login?error=oauth`);
          }
          // The SPA root ("/") is now the public site; send authed staff to the dashboard.
          res.redirect(`${config.dashboardUrl}/dashboard`);
        });
      });
    } catch (err) {
      logger.error(`OAuth callback error: ${err instanceof Error ? err.message : 'unknown'}`);
      res.redirect(`${config.dashboardUrl}/login?error=oauth`);
    }
  });

  router.get('/me', (req, res) => {
    if (!req.session.user?.authorized) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const guildIds = req.session.guildIds ?? [config.guildId];
    const guilds = guildIds.map((id) => {
      const g = client.guilds.cache.get(id);
      return { id, name: g?.name ?? id, icon: g?.iconURL?.() ?? null };
    });
    res.json({
      ...req.session.user,
      isOwner: Boolean(config.ownerDiscordId && req.session.user.id === config.ownerDiscordId),
      guildId: req.session.guildId ?? config.guildId,
      guilds,
    });
  });

  router.post('/select-guild', (req, res) => {
    if (!req.session.user?.authorized) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const guildId = String((req.body as { guildId?: unknown })?.guildId ?? '');
    const ids = req.session.guildIds ?? [config.guildId];
    if (!ids.includes(guildId)) {
      res.status(403).json({ error: 'guild not accessible' });
      return;
    }
    req.session.guildId = guildId;
    res.json({ ok: true, guildId });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  return router;
}
