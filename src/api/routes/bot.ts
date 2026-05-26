import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { getSettings, updateSettings } from '../../db/settingsCache';
import { buildPresence, validatePresenceInput, PRESENCE_TYPES } from '../../bot/presence';
import { logger } from '../../shared/logger';

export interface BotDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
  /** Injectable for tests; defaults to terminating the process so the host restarts it. */
  exit?: (code?: number) => void;
}

export function createBotRouter(deps: BotDeps): Router {
  const router = Router();
  const exit = deps.exit ?? ((code = 0) => process.exit(code));

  router.get('/presence', async (_req, res) => {
    const s = await getSettings(deps.config.guildId);
    res.json({ type: s.botPresenceType, text: s.botPresenceText, url: s.botPresenceUrl, types: PRESENCE_TYPES });
  });

  router.put('/presence', async (req, res) => {
    const { error, value } = validatePresenceInput(req.body ?? {});
    if (error || !value) return res.status(400).json({ error: error ?? 'invalid input' });

    const updated = await updateSettings(deps.config.guildId, {
      botPresenceType: value.type,
      botPresenceText: value.text,
      botPresenceUrl: value.url,
    });

    // Apply immediately to the live bot (best-effort; never fail the save over this).
    try {
      const total = deps.client.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);
      deps.client.user?.setPresence(buildPresence(updated, total));
    } catch (e) {
      logger.warning(`Could not apply presence live: ${e}`);
    }

    res.json({ type: updated.botPresenceType, text: updated.botPresenceText, url: updated.botPresenceUrl });
  });

  router.post('/restart', (_req, res) => {
    logger.warning('Restart requested from dashboard — exiting so the host restarts the process.');
    res.json({ ok: true });
    // Flush the response before the process dies; the host (Railway, restartPolicy=ALWAYS) brings it back.
    setTimeout(() => exit(0), 300);
  });

  return router;
}
