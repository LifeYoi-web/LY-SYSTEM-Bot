import { describe, it, expect } from 'vitest';
import { renderWelcomeCard, WELCOME_CARD_STYLES, WELCOME_CARD_STYLE_KEYS } from '../src/bot/welcomeCard';

const EXPECTED_KEYS = [
  'classic',
  'neon-hud',
  'calligraphy-gold',
  'aurora-glass',
  'islamic-star',
  'vip-ticket',
  'constellation',
  'synthwave',
  'liquid-gold',
];

const base = {
  username: 'أحمد LY',
  avatarUrl: 'https://example.invalid/avatar.png', // load fails -> placeholder branch
  position: 1234,
  serverName: 'LY SYSTEM',
};

describe('welcome card style registry', () => {
  it('declares classic + the 8 art styles with Arabic labels', () => {
    expect([...WELCOME_CARD_STYLE_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort());
    for (const s of WELCOME_CARD_STYLES) expect(s.labelAr.length).toBeGreaterThan(0);
  });

  for (const key of EXPECTED_KEYS) {
    for (const variant of ['welcome', 'goodbye'] as const) {
      it(`renders ${key} / ${variant} as a valid PNG`, async () => {
        const buf = await renderWelcomeCard({ ...base, variant, style: key });
        expect(buf.length).toBeGreaterThan(2000);
        // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
        expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      }, 20000);
    }
  }

  it('falls back to classic for an unknown style', async () => {
    const buf = await renderWelcomeCard({ ...base, style: 'comic-sans' });
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  }, 20000);
});
