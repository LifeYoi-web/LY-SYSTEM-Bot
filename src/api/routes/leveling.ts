import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../shared/config';
import { getLevelConfig, updateLevelConfig, type EditableLevelConfig } from '../../db/leveling';
import { progressInLevel } from '../../shared/leveling';

export interface LevelingDeps {
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

export function createLevelingRouter(deps: LevelingDeps): Router {
  const router = Router();
  const { prisma, config } = deps;
  const guildId = config.guildId;

  router.get('/', async (_req, res) => {
    const [cfg, rewards] = await Promise.all([
      getLevelConfig(guildId),
      prisma.levelRoleReward.findMany({ where: { guildId }, orderBy: { level: 'asc' } }),
    ]);
    res.json({ config: cfg, rewards });
  });

  router.put('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: EditableLevelConfig = {};
    for (const k of ['enabled', 'levelUpEnabled', 'stackRewards', 'voiceXpEnabled'] as const) {
      if (b[k] !== undefined) data[k] = Boolean(b[k]);
    }
    const ints: [keyof EditableLevelConfig, number, number][] = [
      ['xpPerMessage', 1, 100],
      ['cooldownSeconds', 0, 3600],
      ['multiplier', 1, 5],
      ['voiceXpPerMinute', 0, 100],
    ];
    for (const [k, min, max] of ints) {
      if (b[k] !== undefined) {
        const n = Number(b[k]);
        if (!Number.isInteger(n) || n < min || n > max) {
          return res.status(400).json({ error: `${k} must be an integer ${min}..${max}` });
        }
        (data as Record<string, number>)[k] = n;
      }
    }
    if (b.ignoredVoiceChannelIds !== undefined) {
      if (!Array.isArray(b.ignoredVoiceChannelIds)) return res.status(400).json({ error: 'ignoredVoiceChannelIds must be an array' });
      data.ignoredVoiceChannelIds = (b.ignoredVoiceChannelIds as unknown[]).map(String);
    }
    if (b.levelUpChannelId !== undefined) data.levelUpChannelId = optStr(b.levelUpChannelId);
    if (b.levelUpMessage !== undefined) {
      const s = optStr(b.levelUpMessage);
      if (s && s.length > 500) return res.status(400).json({ error: 'levelUpMessage too long' });
      data.levelUpMessage = s;
    }
    res.json(await updateLevelConfig(guildId, data));
  });

  router.get('/leaderboard', async (_req, res) => {
    const rows = await prisma.memberLevel.findMany({ where: { guildId }, orderBy: { xp: 'desc' }, take: 25 });
    res.json({
      leaderboard: rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        xp: r.xp,
        level: r.level,
        progress: progressInLevel(r.xp),
      })),
    });
  });

  router.post('/rewards', async (req, res) => {
    const { level, roleId } = (req.body ?? {}) as { level?: unknown; roleId?: unknown };
    const lvl = Number(level);
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 1000) return res.status(400).json({ error: 'level must be 1..1000' });
    if (!roleId) return res.status(400).json({ error: 'roleId required' });
    const reward = await prisma.levelRoleReward.upsert({
      where: { guildId_level: { guildId, level: lvl } },
      update: { roleId: String(roleId) },
      create: { guildId, level: lvl, roleId: String(roleId) },
    });
    res.status(201).json(reward);
  });

  router.delete('/rewards/:id', async (req, res) => {
    await prisma.levelRoleReward.delete({ where: { id: req.params.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  return router;
}
