import { describe, it, expect } from 'vitest';
import { ActivityType } from 'discord.js';
import { buildPresence, validatePresenceInput } from '../src/bot/presence';

const act = (p: ReturnType<typeof buildPresence>) => (p.activities as any[])[0];

describe('buildPresence', () => {
  it('defaults to Watching "<count> عضو • /help" when nothing is configured', () => {
    const a = act(buildPresence({}, 1706));
    expect(a.type).toBe(ActivityType.Watching);
    expect(a.name).toBe('1706 عضو • /help');
  });

  it('uses the configured type + text', () => {
    const a = act(buildPresence({ botPresenceType: 'playing', botPresenceText: 'مع الأعضاء' }, 0));
    expect(a.type).toBe(ActivityType.Playing);
    expect(a.name).toBe('مع الأعضاء');
  });

  it('substitutes {members} in the text', () => {
    const a = act(buildPresence({ botPresenceType: 'watching', botPresenceText: '{members} عضو' }, 50));
    expect(a.name).toBe('50 عضو');
  });

  it('includes the url for streaming', () => {
    const a = act(buildPresence({ botPresenceType: 'streaming', botPresenceText: 'live', botPresenceUrl: 'https://twitch.tv/x' }, 0));
    expect(a.type).toBe(ActivityType.Streaming);
    expect(a.url).toBe('https://twitch.tv/x');
  });
});

describe('validatePresenceInput', () => {
  it('accepts a valid watching config', () => {
    const r = validatePresenceInput({ type: 'watching', text: 'hello' });
    expect(r.error).toBeUndefined();
    expect(r.value).toEqual({ type: 'watching', text: 'hello', url: null });
  });

  it('rejects an unknown type', () => {
    expect(validatePresenceInput({ type: 'dancing' }).error).toMatch(/type/);
  });

  it('rejects streaming without a twitch/youtube url', () => {
    expect(validatePresenceInput({ type: 'streaming', text: 'x', url: 'https://example.com' }).error).toMatch(/twitch|youtube/i);
    expect(validatePresenceInput({ type: 'streaming', text: 'x' }).error).toBeTruthy();
  });

  it('accepts streaming with a twitch url', () => {
    const r = validatePresenceInput({ type: 'streaming', text: 'x', url: 'https://www.twitch.tv/abc' });
    expect(r.error).toBeUndefined();
    expect(r.value?.url).toBe('https://www.twitch.tv/abc');
  });

  it('rejects text longer than 128 chars', () => {
    expect(validatePresenceInput({ type: 'watching', text: 'a'.repeat(129) }).error).toBeTruthy();
  });

  it('treats empty type/text as null (default presence)', () => {
    expect(validatePresenceInput({ type: '', text: '' }).value).toEqual({ type: null, text: null, url: null });
  });
});
