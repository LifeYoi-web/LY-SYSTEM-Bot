import { prisma } from './prisma';
import type { LevelConfig } from '@prisma/client';

const cache = new Map<string, LevelConfig>();

export type EditableLevelConfig = Partial<
  Pick<
    LevelConfig,
    | 'enabled'
    | 'xpPerMessage'
    | 'cooldownSeconds'
    | 'multiplier'
    | 'levelUpEnabled'
    | 'levelUpChannelId'
    | 'levelUpMessage'
    | 'stackRewards'
    | 'voiceXpEnabled'
    | 'voiceXpPerMinute'
    | 'ignoredVoiceChannelIds'
  >
>;

export async function getLevelConfig(guildId: string): Promise<LevelConfig> {
  const cached = cache.get(guildId);
  if (cached) return cached;
  const cfg = await prisma.levelConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  cache.set(guildId, cfg);
  return cfg;
}

export async function updateLevelConfig(guildId: string, data: EditableLevelConfig): Promise<LevelConfig> {
  const cfg = await prisma.levelConfig.upsert({ where: { guildId }, update: data, create: { guildId, ...data } });
  cache.set(guildId, cfg);
  return cfg;
}

export function invalidateLevelConfig(guildId: string): void {
  cache.delete(guildId);
}
