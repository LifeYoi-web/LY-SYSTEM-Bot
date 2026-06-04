enum LogLevel {
  INFO = '📘 INFO',
  SUCCESS = '✅ SUCCESS',
  WARNING = '⚠️ WARNING',
  ERROR = '❌ ERROR',
}

// Fleet-safety (SaaS Phase 0, spec §6.3): scrub anything token-shaped before it
// reaches stdout. Defense in depth — token plaintext must never be logged.
// Scope: bot tokens + JWTs only. Legacy mfa.-prefixed user tokens are NOT covered
// (threat model is bot tokens; user-token logging is out of scope).
// Bounds are deliberate anti-ReDoS caps — unbounded {n,} causes O(n²) backtracking
// on long inputs (measured: 12.6s on a 32k-char line). These caps keep detection
// linear while covering all real Discord tokens and standard JWTs.
const TOKEN_TRIPLET = /[A-Za-z0-9_-]{20,512}\.[A-Za-z0-9_-]{5,512}\.[A-Za-z0-9_-]{20,2048}/g; // Discord token / JWT
const AUTH_PREFIX = /\b(Bot|Bearer)\s+[A-Za-z0-9_\-.=+/]{20,512}/g; // auth-header style (bounds for consistency)

export function redact(rawMessage: string): string {
  // Hard cap: redaction runs on EVERY log line — never let one huge message stall the loop.
  // 4096 chars covers any real log line; tokens always appear near the start of a message.
  let message = rawMessage.length > 4_096
    ? rawMessage.slice(0, 4_096) + '…[truncated]'
    : rawMessage;
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
