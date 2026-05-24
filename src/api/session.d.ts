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
  }
}
