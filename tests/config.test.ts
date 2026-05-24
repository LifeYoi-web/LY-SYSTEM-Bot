import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/shared/config';

const base = {
  DISCORD_TOKEN: 't', CLIENT_ID: 'c', DISCORD_CLIENT_SECRET: 's',
  SESSION_SECRET: 'x', GUILD_ID: 'g', DATABASE_URL: 'd',
  DASHBOARD_URL: 'http://localhost:5173', OAUTH_REDIRECT_URI: 'http://localhost:3000/api/auth/callback',
};

describe('loadConfig', () => {
  it('parses a complete env and defaults the port to 3000', () => {
    const cfg = loadConfig(base as any);
    expect(cfg.guildId).toBe('g');
    expect(cfg.port).toBe(3000);
  });

  it('reads PORT when provided', () => {
    expect(loadConfig({ ...base, PORT: '8080' } as any).port).toBe(8080);
  });

  it('throws naming the missing variable', () => {
    const { GUILD_ID, ...partial } = base as any;
    expect(() => loadConfig(partial)).toThrow(/GUILD_ID/);
  });
});
