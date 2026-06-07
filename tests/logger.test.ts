import { describe, it, expect, vi } from 'vitest';
import { redact, logger } from '../src/shared/logger';

const FAKE_TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxxxx.yyyyyy.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';

describe('redact', () => {
  it('scrubs Discord-bot-token-shaped triplets', () => {
    expect(redact(`login failed for ${FAKE_TOKEN} (401)`)).toBe('login failed for [REDACTED] (401)');
  });

  it('scrubs JWT-shaped triplets', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    expect(redact(`got ${jwt}`)).toBe('got [REDACTED]');
  });

  it('scrubs long credentials after Bot/Bearer prefixes', () => {
    expect(redact('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456')).toBe('Authorization: Bearer [REDACTED]');
    expect(redact(`header "Bot ${FAKE_TOKEN}"`)).toContain('[REDACTED]');
    expect(redact(`header "Bot ${FAKE_TOKEN}"`)).not.toContain('yyyyyy');
  });

  it('leaves normal messages untouched (incl. short words after "Bot")', () => {
    const msg = 'Bot is online as: LY-SYSTEM#8787 — v1.2.3 ready';
    expect(redact(msg)).toBe(msg);
  });

  it('stays fast on pathological long input (ReDoS guard)', () => {
    const huge = 'A'.repeat(50_000) + '.' + 'A'.repeat(50_000);
    const t0 = performance.now();
    redact(huge);
    // Guards against catastrophic backtracking (the unbounded regex took >10s here).
    // 2s keeps the guard meaningful while tolerating CPU contention from parallel
    // vitest workers — the old 500ms bound flaked at ~534ms under load.
    expect(performance.now() - t0).toBeLessThan(2_000);
  });

  it('does not truncate realistic long error dumps (<50k)', () => {
    const dump = 'DiscordAPIError: '.padEnd(10_000, 'x');
    expect(redact(dump)).toBe(dump);
  });
});

describe('logger output redaction', () => {
  it('redacts token-shaped strings in logger.error output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.error(`bad token ${FAKE_TOKEN}`);
    expect(spy.mock.calls[0][0]).toContain('[REDACTED]');
    expect(spy.mock.calls[0][0]).not.toContain('yyyyyy');
    spy.mockRestore();
  });
});
