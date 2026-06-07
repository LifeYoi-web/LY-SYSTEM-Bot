import { Router } from 'express';
import type { Client } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { getRaidConfig, updateRaidConfig } from '../../db/community';
import { tenantGuildId } from '../middleware/tenant';
import { channelInGuild } from '../util';

export interface RaidDeps {
  client: Client;
  config: Pick<AppConfig, 'guildId'>;
}

const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

const ACTIONS = ['lockdown', 'kick', 'ban'];

export function createRaidRouter(deps: RaidDeps): Router {
  const router = Router();
  const { client } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    res.json(await getRaidConfig(guildId));
  });

  router.put('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const k of ['enabled', 'raiseVerification'] as const) if (b[k] !== undefined) data[k] = Boolean(b[k]);
    if (b.action !== undefined) {
      if (!ACTIONS.includes(String(b.action))) return res.status(400).json({ error: `action must be one of ${ACTIONS.join(', ')}` });
      data.action = String(b.action);
    }
    const ints: [string, number, number][] = [
      ['joinWindowSec', 1, 600],
      ['joinThreshold', 2, 1000],
      ['autoLiftMinutes', 0, 1440],
    ];
    for (const [k, min, max] of ints) {
      if (b[k] !== undefined) {
        const n = Number(b[k]);
        if (!Number.isInteger(n) || n < min || n > max) return res.status(400).json({ error: `${k} must be ${min}..${max}` });
        data[k] = n;
      }
    }
    if (b.alertChannelId !== undefined) {
      const v = optStr(b.alertChannelId);
      if (v && !channelInGuild(client, guildId, v)) return res.status(400).json({ error: 'invalid channel' });
      data.alertChannelId = v;
    }
    res.json(await updateRaidConfig(guildId, data));
  });

  return router;
}
