export interface AppConfig {
  discordToken: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  guildId: string;
  databaseUrl: string;
  dashboardUrl: string;
  oauthRedirectUri: string;
  port: number;
  isProd: boolean;
}

const REQUIRED = [
  'DISCORD_TOKEN', 'CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'SESSION_SECRET',
  'GUILD_ID', 'DATABASE_URL', 'DASHBOARD_URL', 'OAUTH_REDIRECT_URI',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    discordToken: env.DISCORD_TOKEN!,
    clientId: env.CLIENT_ID!,
    clientSecret: env.DISCORD_CLIENT_SECRET!,
    sessionSecret: env.SESSION_SECRET!,
    guildId: env.GUILD_ID!,
    databaseUrl: env.DATABASE_URL!,
    dashboardUrl: env.DASHBOARD_URL!,
    oauthRedirectUri: env.OAUTH_REDIRECT_URI!,
    port: Number(env.PORT ?? 3000),
    isProd: env.NODE_ENV === 'production',
  };
}
