import { describe, it, expect, vi } from 'vitest';
import { buildOnboardingEmbed, postOnboarding } from '../src/bot/onboarding';

function fakeGuild(opts: { system?: boolean; sendable?: boolean } = {}) {
  const send = vi.fn().mockResolvedValue({});
  const me = { id: 'bot' };
  const sendableChannel = {
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => opts.sendable !== false }),
    send,
  };
  return {
    guild: {
      name: 'سيرفر تجريبي',
      members: { me },
      systemChannel: opts.system === false ? null : sendableChannel,
      channels: { cache: new Map(opts.system === false ? [['c1', sendableChannel]] : []) },
    } as any,
    send,
  };
}

describe('buildOnboardingEmbed', () => {
  it('is an Arabic LY-orange embed carrying the dashboard link', () => {
    const embed = buildOnboardingEmbed('https://dash.example').toJSON();
    expect(embed.color).toBe(0xf57c00);
    expect(embed.title).toContain('LY-SYSTEM');
    expect(JSON.stringify(embed)).toContain('https://dash.example');
  });
});

describe('postOnboarding', () => {
  it('posts to the system channel when sendable', async () => {
    const { guild, send } = fakeGuild();
    expect(await postOnboarding(guild, 'https://dash.example')).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('falls back to the first sendable text channel when no system channel', async () => {
    const { guild, send } = fakeGuild({ system: false });
    expect(await postOnboarding(guild, 'https://dash.example')).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns false (never throws) when nothing is sendable', async () => {
    const { guild } = fakeGuild({ system: false, sendable: false });
    expect(await postOnboarding(guild, 'https://dash.example')).toBe(false);
  });
});
