enum LogLevel {
  INFO = '📘 INFO',
  SUCCESS = '✅ SUCCESS',
  WARNING = '⚠️ WARNING',
  ERROR = '❌ ERROR',
}

function log(level: LogLevel, message: string): void {
  const timestamp = new Date().toLocaleString('en-US');
  console.log(`[${timestamp}] ${level}: ${message}`);
}

export const logger = {
  info: (msg: string) => log(LogLevel.INFO, msg),
  success: (msg: string) => log(LogLevel.SUCCESS, msg),
  warning: (msg: string) => log(LogLevel.WARNING, msg),
  error: (msg: string) => log(LogLevel.ERROR, msg),
};
