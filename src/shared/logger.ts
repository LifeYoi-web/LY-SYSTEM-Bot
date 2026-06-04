enum LogLevel {
  INFO = '📘 INFO',
  SUCCESS = '✅ SUCCESS',
  WARNING = '⚠️ WARNING',
  ERROR = '❌ ERROR',
}

// Fleet-safety (SaaS Phase 0, spec §6.3): scrub anything token-shaped before it
// reaches stdout. Defense in depth — token plaintext must never be logged.
const TOKEN_TRIPLET = /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}/g; // Discord token / JWT
const AUTH_PREFIX = /\b(Bot|Bearer)\s+[A-Za-z0-9_\-.=+/]{20,}/g; // auth-header style

export function redact(message: string): string {
  return message.replace(TOKEN_TRIPLET, '[REDACTED]').replace(AUTH_PREFIX, '$1 [REDACTED]');
}

function log(level: LogLevel, message: string): void {
  const timestamp = new Date().toLocaleString('en-US');
  console.log(`[${timestamp}] ${level}: ${redact(message)}`);
}

export const logger = {
  info: (msg: string) => log(LogLevel.INFO, msg),
  success: (msg: string) => log(LogLevel.SUCCESS, msg),
  warning: (msg: string) => log(LogLevel.WARNING, msg),
  error: (msg: string) => log(LogLevel.ERROR, msg),
};
