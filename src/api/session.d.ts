import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      username: string;
      avatar: string | null;
      authorized: boolean;
    };
    oauthState?: string;
    /** Guilds (ids) where this user is staff — computed at login (A2b multi-guild). */
    guildIds?: string[];
    /** The currently selected guild (must be one of guildIds). */
    guildId?: string;
  }
}
