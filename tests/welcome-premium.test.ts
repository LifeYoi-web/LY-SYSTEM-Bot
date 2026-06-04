import { describe, it, expect } from 'vitest';
import { renderTemplate, formatAccountAge, parseWelcomeButtons, stripMentionKeepName } from '../src/bot/welcome';
import { renderWelcomeCard } from '../src/bot/welcomeCard';

describe('renderTemplate (extended placeholders)', () => {
  const ctx = {
    user: '<@1>',
    username: 'أحمد',
    server: 'LY',
    memberCount: 100,
    position: 100,
    createdTimestamp: new Date('2024-01-01T00:00:00Z').getTime(),
  };

  it('substitutes {position}', () => {
    expect(renderTemplate('#{position}', ctx)).toBe('#100');
  });

  it('substitutes {accountAge} with a localized human form', () => {
    const out = renderTemplate('عمر: {accountAge}', ctx);
    expect(out.startsWith('عمر: ')).toBe(true);
    expect(out.length).toBeGreaterThan('عمر: '.length);
  });

  it('substitutes {createdAt} as a Discord relative-time tag', () => {
    const out = renderTemplate('{createdAt}', ctx);
    expect(out).toMatch(/^<t:\d+:R>$/);
  });
});

describe('formatAccountAge', () => {
  const now = new Date('2026-05-28T00:00:00Z').getTime();
  it('returns days for under a month', () => {
    expect(formatAccountAge(now - 14 * 86_400_000, now)).toContain('يوم');
  });
  it('returns months for under a year', () => {
    expect(formatAccountAge(now - 90 * 86_400_000, now)).toContain('شهر');
  });
  it('returns years for over a year', () => {
    expect(formatAccountAge(now - 800 * 86_400_000, now)).toContain('سن');
  });
});

describe('parseWelcomeButtons', () => {
  it('keeps only well-formed http(s) buttons', () => {
    const buttons = parseWelcomeButtons([
      { label: 'القوانين', url: 'https://example.com/rules' },
      { label: 'سيء', url: 'javascript:alert(1)' }, // dropped — bad protocol
      { label: '', url: 'https://x' }, // dropped — empty label
      { label: 'عادي', url: 'http://x.com', emoji: '📜' },
    ]);
    expect(buttons).toHaveLength(2);
    expect(buttons[0].label).toBe('القوانين');
    expect(buttons[1].emoji).toBe('📜');
  });
  it('caps at 5 buttons', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `b${i}`, url: 'https://x' }));
    expect(parseWelcomeButtons(many)).toHaveLength(5);
  });
  it('returns [] on bad input', () => {
    expect(parseWelcomeButtons(null)).toEqual([]);
    expect(parseWelcomeButtons('not-an-array')).toEqual([]);
  });
});

describe('stripMentionKeepName', () => {
  it('replaces the mention with the bold username so the sentence stays readable', () => {
    expect(stripMentionKeepName('أهلًا وسهلًا <@42> في السيرفر!', '42', 'أحمد')).toBe(
      'أهلًا وسهلًا **أحمد** في السيرفر!',
    );
  });

  it('replaces every occurrence', () => {
    expect(stripMentionKeepName('<@7> و <@7>', '7', 'X')).toBe('**X** و **X**');
  });

  it('leaves other mentions and text untouched, and trims', () => {
    expect(stripMentionKeepName('  <@1> مع <@2> ', '1', 'A')).toBe('**A** مع <@2>');
  });
});

describe('renderWelcomeCard', () => {
  it('produces a non-empty PNG buffer with the right magic bytes', async () => {
    const buf = await renderWelcomeCard({
      username: 'أحمد LY',
      avatarUrl: 'https://example.invalid/avatar.png', // load will fail -> placeholder branch
      position: 42,
      serverName: 'LY-SYSTEM',
      variant: 'welcome',
    });
    expect(buf.length).toBeGreaterThan(2000);
    // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  }, 15000);

  it('renders the goodbye variant without throwing', async () => {
    const buf = await renderWelcomeCard({
      username: 'someone',
      avatarUrl: 'https://example.invalid/avatar.png',
      position: 7,
      serverName: 'LY',
      variant: 'goodbye',
    });
    expect(buf.length).toBeGreaterThan(2000);
  }, 15000);
});
