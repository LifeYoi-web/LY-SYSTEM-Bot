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

    // Account-age / alt gate on join.
    if (b.minAccountAgeDays !== undefined) {
      const n = Number(b.minAccountAgeDays);
      if (!Number.isInteger(n) || n < 0 || n > 365) {
        return res.status(400).json({ error: 'minAccountAgeDays must be 0..365' });
      }
      data.minAccountAgeDays = n;
    }
    if (b.altGateAction !== undefined) {
      const v = String(b.altGateAction);
      if (!['kick', 'quarantine', 'alert'].includes(v)) {
        return res.status(400).json({ error: 'altGateAction must be kick | quarantine | alert' });
      }
      data.altGateAction = v;
    }
    if (b.quarantineRoleId !== undefined) data.quarantineRoleId = optStr(b.quarantineRoleId);

    if (b.staffRoleIds !== undefined) {
      if (!Array.isArray(b.staffRoleIds)) {
        return res.status(400).json({ error: 'staffRoleIds must be an array' });
      }
      data.staffRoleIds = b.staffRoleIds.map(String);
    }

    for (const k of ['welcomeEnabled', 'goodbyeEnabled', 'welcomeUseCard', 'goodbyeUseCard', 'welcomeDmEnabled'] as const) {
      if (b[k] !== undefined) data[k] = Boolean(b[k]);
    }
    for (const k of ['welcomeMessage', 'goodbyeMessage', 'welcomeDmMessage'] as const) {
      if (b[k] !== undefined) {
        const s = optStr(b[k]);
        if (s && s.length > MAX_MESSAGE) {
          return res.status(400).json({ error: `${k} must be <= ${MAX_MESSAGE} chars` });
        }
        data[k] = s;
      }
    }
    if (b.welcomeMentionDeleteSeconds !== undefined) {
      const n = Number(b.welcomeMentionDeleteSeconds);
      if (!Number.isFinite(n) || n < 0 || n > 60) {
        return res.status(400).json({ error: 'welcomeMentionDeleteSeconds must be 0..60' });
      }
      data.welcomeMentionDeleteSeconds = Math.floor(n);
    }
    if (b.welcomeCardBg !== undefined) {
      const v = optStr(b.welcomeCardBg);
      if (v) {
        if (!v.startsWith('data:image/')) {
          return res.status(400).json({ error: 'welcomeCardBg must be a data:image/* URL' });
        }
        if (v.length > 2_200_000) {
          return res.status(400).json({ error: 'welcomeCardBg too large (max ~1.5MB)' });
        }
      }
      data.welcomeCardBg = v;
    }
    if (b.welcomeButtons !== undefined) {
      if (!Array.isArray(b.welcomeButtons)) {
        return res.status(400).json({ error: 'welcomeButtons must be an array' });
      }
      if (b.welcomeButtons.length > 5) {
        return res.status(400).json({ error: 'welcomeButtons supports at most 5 entries' });
      }
      for (const raw of b.welcomeButtons) {
        if (!raw || typeof raw !== 'object') return res.status(400).json({ error: 'invalid button shape' });
        const o = raw as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label.trim() : '';
        const url = typeof o.url === 'string' ? o.url.trim() : '';
        if (!label || label.length > 80) return res.status(400).json({ error: 'button label required (≤80 chars)' });
        if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'button url must be http(s)' });
      }
      data.welcomeButtons = b.welcomeButtons;
    }

    const updated = await updateSettings(deps.config.guildId, data);
    res.json(updated);
  });

  return router;
}
