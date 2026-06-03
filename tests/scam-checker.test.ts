import { describe, it, expect } from 'vitest';
import { checkScamLink, DEFAULT_SCAM_DOMAINS } from '../src/bot/automod/checker';

describe('checkScamLink', () => {
  it('matches a known default scam domain (case-insensitive)', () => {
    expect(checkScamLink('claim your FREE-NITRO here http://Discord-Nitro.ru/x', [])).toBe(true);
  });

  it('uses the guild list when provided and ignores defaults', () => {
    expect(checkScamLink('visit evil.example/win', ['evil.example'])).toBe(true);
    expect(checkScamLink('visit discordnitro.ru', ['evil.example'])).toBe(false);
  });

  it('does not flag a clean message', () => {
    expect(checkScamLink('check this youtube.com/watch?v=abc', [])).toBe(false);
  });

  it('ships a non-empty default domain list', () => {
    expect(DEFAULT_SCAM_DOMAINS.length).toBeGreaterThan(5);
  });
});
