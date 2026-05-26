import { ActivityType, type PresenceData } from 'discord.js';

export const PRESENCE_TYPES = ['playing', 'listening', 'watching', 'streaming', 'custom'] as const;
export type PresenceType = (typeof PRESENCE_TYPES)[number];

const TYPE_MAP: Record<PresenceType, ActivityType> = {
  playing: ActivityType.Playing,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  streaming: ActivityType.Streaming,
  custom: ActivityType.Custom,
};

// Discord only renders a clickable "live" stream indicator for twitch/youtube URLs.
const STREAM_URL = /^https?:\/\/(www\.)?(twitch\.tv|youtube\.com|youtu\.be)\/.+/i;
const MAX_TEXT = 128;

export interface PresenceConfig {
  botPresenceType?: string | null;
  botPresenceText?: string | null;
  botPresenceUrl?: string | null;
}

/** Build the discord.js presence from the stored config. Falls back to the default
 *  "Watching <count> عضو • /help" when nothing is configured. `{members}` in the text
 *  is replaced with the live member count. */
export function buildPresence(cfg: PresenceConfig, totalMembers: number): PresenceData {
  const rawText =
    cfg.botPresenceText && cfg.botPresenceText.trim() ? cfg.botPresenceText : `${totalMembers} عضو • /help`;
  const name = rawText.replace(/\{members\}/g, String(totalMembers));
  const type =
    cfg.botPresenceType && cfg.botPresenceType in TYPE_MAP
      ? TYPE_MAP[cfg.botPresenceType as PresenceType]
      : ActivityType.Watching;

  const activity: { name: string; type: ActivityType; url?: string; state?: string } = { name, type };
  if (type === ActivityType.Streaming && cfg.botPresenceUrl) activity.url = cfg.botPresenceUrl;
  if (type === ActivityType.Custom) activity.state = name; // custom status shows `state`
  return { status: 'online', activities: [activity] };
}

/** Validate + normalize dashboard input into storable {type,text,url}. */
export function validatePresenceInput(input: { type?: unknown; text?: unknown; url?: unknown }): {
  error?: string;
  value?: { type: string | null; text: string | null; url: string | null };
} {
  let type: string | null = null;
  if (input.type !== undefined && input.type !== null && String(input.type) !== '') {
    const t = String(input.type).toLowerCase();
    if (!PRESENCE_TYPES.includes(t as PresenceType)) {
      return { error: `type must be one of ${PRESENCE_TYPES.join(', ')}` };
    }
    type = t;
  }

  let text: string | null = null;
  if (input.text !== undefined && input.text !== null) {
    const s = String(input.text);
    if (s.length > MAX_TEXT) return { error: `text must be ${MAX_TEXT} characters or fewer` };
    text = s.trim() ? s : null;
  }

  // A URL is only meaningful for streaming, and Discord requires twitch/youtube.
  let url: string | null = null;
  if (type === 'streaming') {
    const u = input.url ? String(input.url) : '';
    if (!STREAM_URL.test(u)) return { error: 'streaming requires a twitch.tv or youtube.com URL' };
    url = u;
  }

  return { value: { type, text, url } };
}
