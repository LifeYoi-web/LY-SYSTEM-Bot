import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getAlertConfig, updateAlertConfig } from '../../db/community';
import { tenantGuildId } from '../middleware/tenant';

export interface AlertsDeps {
  config: Pick<AppConfig, 'guildId'>;
}

const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

export function createAlertsRouter(deps: AlertsDeps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    res.json(await getAlertConfig(guildId));
  });

  router.put('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const k of ['enabled', 'leaveSpikeEnabled', 'activityDropEnabled', 'joinSpikeEnabled'] as const) {
      if (b[k] !== undefined) data[k] = Boolean(b[k]);
    }
    const ints: [string, number, number][] = [
      ['leaveSpikeThreshold', 1, 100000],
      ['activityDropPct', 1, 100],
      ['joinSpikeThreshold', 1, 100000],
    ];
    for (const [k, min, max] of ints) {
      if (b[k] !== undefined) {
        const n = Number(b[k]);
        if (!Number.isInteger(n) || n < min || n > max) return res.status(400).json({ error: `${k} must be ${min}..${max}` });
        data[k] = n;
      }
    }
    if (b.alertChannelId !== undefined) data.alertChannelId = optStr(b.alertChannelId);
    res.json(await updateAlertConfig(guildId, data));
  });

  return router;
}
