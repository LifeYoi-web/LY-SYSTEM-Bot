import { describe, it, expect } from 'vitest';
import { matchAutoResponse } from '../src/db/autoresponses';

const mk = (trigger: string, reply: string, matchType = 'contains') =>
  ({ id: trigger, guildId: 'g', trigger, reply, matchType, enabled: true }) as any;

describe('matchAutoResponse', () => {
  it('matches contains case-insensitively', () => {
    expect(matchAutoResponse('well HELLO there', [mk('hello', 'hi')])?.reply).toBe('hi');
  });
  it('matches exact only on full equality', () => {
    expect(matchAutoResponse('!ping', [mk('!ping', 'pong', 'exact')])?.reply).toBe('pong');
    expect(matchAutoResponse('!ping me', [mk('!ping', 'pong', 'exact')])).toBeNull();
  });
  it('matches startswith', () => {
    expect(matchAutoResponse('hey you', [mk('hey', 'yo', 'startswith')])?.reply).toBe('yo');
    expect(matchAutoResponse('oh hey', [mk('hey', 'yo', 'startswith')])).toBeNull();
  });
  it('returns null on empty content or no match', () => {
    expect(matchAutoResponse('   ', [mk('hi', 'x')])).toBeNull();
    expect(matchAutoResponse('nothing here', [mk('zzz', 'x')])).toBeNull();
  });
  it('returns the first matching rule', () => {
    expect(matchAutoResponse('hello world', [mk('hello', 'first'), mk('world', 'second')])?.reply).toBe('first');
  });
});
