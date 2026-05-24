import { describe, it, expect, beforeEach } from 'vitest';
import { checkContent, checkSpam, _resetSpam, type ContentRules } from '../src/bot/automod/checker';

const rules: ContentRules = {
  antiInvite: true,
  antiLink: true,
  bannedWords: ['badword'],
  maxMentions: 3,
};

describe('automod content checker', () => {
  it('flags banned words case-insensitively', () => {
    expect(checkContent('this is a BadWord here', 0, rules)).toBe('banned_word');
  });

  it('flags discord invites', () => {
    expect(checkContent('join discord.gg/abc123', 0, rules)).toBe('invite');
    expect(checkContent('join discordapp.com/invite/xyz', 0, rules)).toBe('invite');
  });

  it('flags generic links when antiLink is on', () => {
    expect(checkContent('see https://example.com', 0, rules)).toBe('link');
  });

  it('flags excessive mentions', () => {
    expect(checkContent('hi', 4, rules)).toBe('mentions');
    expect(checkContent('hi', 3, rules)).toBeNull();
  });

  it('returns null for clean content', () => {
    expect(checkContent('just a normal message', 1, rules)).toBeNull();
  });

  it('respects toggles being off', () => {
    expect(checkContent('https://x.com', 0, { ...rules, antiLink: false, antiInvite: false })).toBeNull();
  });
});

describe('automod spam window', () => {
  beforeEach(() => _resetSpam());
  it('triggers after exceeding the burst limit', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(checkSpam('u1', now + i)).toBe(false);
    expect(checkSpam('u1', now + 5)).toBe(true); // 6th message within window
  });

  it('does not trigger across users', () => {
    const now = 2_000_000;
    for (let i = 0; i < 6; i++) checkSpam('u1', now + i);
    expect(checkSpam('u2', now)).toBe(false);
  });
});
