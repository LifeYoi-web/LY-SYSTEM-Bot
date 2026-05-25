export interface BootDeps {
  guildId: string;
  login: () => Promise<unknown>;
  ensureGuildSettings: (guildId: string) => Promise<unknown>;
  startApiServer: () => void;
  startScheduler: () => void;
  registerCommands: () => Promise<unknown>;
  logError: (msg: string) => void;
}

/**
 * Boot order matters: the bot/dashboard must come up even if Discord command
 * registration hangs or fails. Registration calls Discord's REST API, which can
 * block on a rate limit (it waits out the retry-after) or reject — so it runs
 * LAST and fire-and-forget, never awaited before the API server starts.
 *
 * Regression: a guild-command-registration call hung on 5/24, and because it was
 * awaited before startApiServer, the whole dashboard 502'd for ~24h. See tests/boot.test.ts.
 */
export async function boot(deps: BootDeps): Promise<void> {
  await deps.login();
  await deps.ensureGuildSettings(deps.guildId);
  deps.startApiServer();
  deps.startScheduler();
  void Promise.resolve()
    .then(() => deps.registerCommands())
    .catch((err) => deps.logError(`Command registration failed (continuing): ${err}`));
}
