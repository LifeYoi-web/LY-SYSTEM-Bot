import { Router } from 'express';
import type { AppConfig } from '../../shared/config';
import { getSettings, updateSettings, type EditableSettings } from '../../db/settingsCache';

export interface SettingsDeps {
  config: Pick<AppConfig, 'guildId'>;
}

const LANGUAGES = ['ar', 'en'];
const MAX_MESSAGE = 2000;

/** Coerce an optional id/string field: empty string clears it to null. */
function optStr(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

export function createSettingsRouter(deps: SettingsDeps): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await getSettings(deps.config.guildId));
  });

  router.put('/', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const data: EditableSettings = {};

    if (b.language !== undefined) {
      if (!LANGUAGES.includes(String(b.language))) {
        return res.status(400).json({ error: `language must be one of ${LANGUAGES.join(', ')}` });
      }
      data.language = String(b.language);
    }
    if (b.logChannelId !== undefined) data.logChannelId = optStr(b.logChannelId);
    if (b.welcomeChannelId !== undefined) data.welcomeChannelId = optStr(b.welcomeChannelId);
    if (b.autoRoleId !== undefined) data.autoRoleId = optStr(b.autoRoleId);

    if (b.staffRoleIds !== undefined) {
      if (!Array.isArray(b.staffRoleIds)) {
        return res.status(400).json({ error: 'staffRoleIds must be an array' });
      }
      data.staffRoleIds = b.staffRoleIds.map(String);
    }

    for (const k of ['welcomeEnabled', 'goodbyeEnabled'] as const) {
      if (b[k] !== undefined) data[k] = Boolean(b[k]);
    }
    for (const k of ['welcomeMessage', 'goodbyeMessage'] as const) {
      if (b[k] !== undefined) {
        const s = optStr(b[k]);
        if (s && s.length > MAX_MESSAGE) {
          return res.status(400).json({ error: `${k} must be <= ${MAX_MESSAGE} chars` });
        }
        data[k] = s;
      }
    }

    const updated = await updateSettings(deps.config.guildId, data);
    res.json(updated);
  });

  return router;
}
