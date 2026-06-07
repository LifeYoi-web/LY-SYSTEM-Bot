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
  /** Optional: RapidAPI key enabling the TikTok creator-announce source. Absent => TikTok stays off. */
  rapidApiKey?: string;
  /** Optional: RapidAPI TikTok host (defaults to the tiktok-scraper7 provider). */
  rapidApiTikTokHost?: string;
  /** Optional: external Lavalink node enabling the music feature. Absent => music stays off. */
  lavalinkHost?: string;
  lavalinkPort?: number;
  lavalinkPassword?: string;
  lavalinkSecure?: boolean;
  /** Optional: Anthropic API key enabling AI ticket summaries. Absent => AI features stay off. */
  anthropicApiKey?: string;
  /** Optional: Discord user id allowed on owner-only routes (/api/bot, future fleet/payments). Absent => those routes deny. */
  ownerDiscordId?: string;
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
    rapidApiKey: env.RAPIDAPI_KEY || undefined,
    rapidApiTikTokHost: env.RAPIDAPI_TIKTOK_HOST || undefined,
    lavalinkHost: env.LAVALINK_HOST || undefined,
    lavalinkPort: env.LAVALINK_PORT ? Number(env.LAVALINK_PORT) : undefined,
    lavalinkPassword: env.LAVALINK_PASSWORD || undefined,
    lavalinkSecure: env.LAVALINK_SECURE === 'true',
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    ownerDiscordId: env.OWNER_DISCORD_ID || undefined,
  };
}
