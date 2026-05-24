import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getSettings, updateSettings } from '../../db/settingsCache';

export interface SettingsDeps {
  config: Pick<AppConfig, 'guildId'>;
}

export function createSettingsRouter(deps: SettingsDeps): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await getSettings(deps.config.guildId));
  });

  router.put('/', async (req, res) => {
    const { logChannelId, staffRoleIds } = req.body ?? {};
    const data: { logChannelId?: string | null; staffRoleIds?: string[] } = {};
    if (logChannelId !== undefined) data.logChannelId = logChannelId ? String(logChannelId) : null;
    if (staffRoleIds !== undefined) {
      if (!Array.isArray(staffRoleIds)) {
        res.status(400).json({ error: 'staffRoleIds must be an array' });
        return;
      }
      data.staffRoleIds = staffRoleIds.map(String);
    }
    const updated = await updateSettings(deps.config.guildId, data);
    res.json(updated);
  });

  return router;
}
