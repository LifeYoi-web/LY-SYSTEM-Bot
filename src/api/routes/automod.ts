import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import {
  getAutoMod,
  updateAutoMod,
  AUTOMOD_ACTIONS,
  type EditableAutoMod,
  type AutoModAction,
} from '../../db/automod';

export interface AutoModDeps {
  config: Pick<AppConfig, 'guildId'>;
}

const MAX_MUTE_SECONDS = 2_419_200; // Discord timeout cap = 28 days

function normalizeWords(input: unknown[]): string[] {
  const seen = new Set<string>();
  for (const w of input) {
    const s = String(w).trim().toLowerCase();
    if (s && s.length <= 64) seen.add(s);
  }
  return [...seen].slice(0, 200);
}

export function createAutoModRouter(deps: AutoModDeps): Router {
  const router = Router();
  const { config } = deps;

  router.get('/', async (_req, res) => {
    res.json(await getAutoMod(config.guildId));
  });

  router.put('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: EditableAutoMod = {};

    for (const k of ['enabled', 'antiSpam', 'antiInvite', 'antiLink', 'antiScam'] as const) {
      if (b[k] !== undefined) data[k] = Boolean(b[k]);
    }
    if (b.scamAction !== undefined) {
      if (!AUTOMOD_ACTIONS.includes(b.scamAction as AutoModAction)) {
        return res.status(400).json({ error: `scamAction must be one of ${AUTOMOD_ACTIONS.join(', ')}` });
      }
      data.scamAction = b.scamAction as string;
    }
    if (b.scamDomains !== undefined) {
      if (!Array.isArray(b.scamDomains)) return res.status(400).json({ error: 'scamDomains must be an array' });
      data.scamDomains = normalizeWords(b.scamDomains);
    }
    if (b.maxMentions !== undefined) {
      const n = Number(b.maxMentions);
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        return res.status(400).json({ error: 'maxMentions must be an integer 1..50' });
      }
      data.maxMentions = n;
    }
    if (b.muteSeconds !== undefined) {
      const n = Number(b.muteSeconds);
      if (!Number.isInteger(n) || n < 1 || n > MAX_MUTE_SECONDS) {
        return res.status(400).json({ error: `muteSeconds must be 1..${MAX_MUTE_SECONDS}` });
      }
      data.muteSeconds = n;
    }
    if (b.actionOnViolation !== undefined) {
      if (!AUTOMOD_ACTIONS.includes(b.actionOnViolation as AutoModAction)) {
        return res.status(400).json({ error: `actionOnViolation must be one of ${AUTOMOD_ACTIONS.join(', ')}` });
      }
      data.actionOnViolation = b.actionOnViolation as string;
    }
    if (b.bannedWords !== undefined) {
      if (!Array.isArray(b.bannedWords)) return res.status(400).json({ error: 'bannedWords must be an array' });
      data.bannedWords = normalizeWords(b.bannedWords);
    }
    for (const k of ['ignoredChannelIds', 'ignoredRoleIds'] as const) {
      if (b[k] !== undefined) {
        if (!Array.isArray(b[k])) return res.status(400).json({ error: `${k} must be an array` });
        data[k] = (b[k] as unknown[]).map(String);
      }
    }

    res.json(await updateAutoMod(config.guildId, data));
  });

  return router;
}
