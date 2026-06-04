export interface BootDeps {
  guildId: string;
  login: () => Promise<unknown>;
  ensureGuildSettings: (guildId: string) => Promise<unknown>;
  startApiServer: () => void;
  startScheduler: () => void;
  registerCommands: () => Promise<unknown>;
  logError: (msg: string) => void;
  logInfo: (msg: string) => void;
}

/**
 * Boot order matters: the bot/dashboard must come up even if Discord command
 * registration hangs or fails. Registration calls Discord's REST API, which can
 * block on a rate limit (it waits out the retry-after) or reject — so it runs
 * LAST and fire-and-forget, never awaited before the API server starts.
 *
 * Regression: a guild-command-registration call hung on 5/24, and because it was
 * awaited before startApiServer, the whole dashboard 502'd for ~24h. See tests/boot.test.ts.
 *
 * Fleet-safety (SaaS Phase 0, spec §6.2): a failed Discord login must not take
 * the process down either — the dashboard/API still starts so the owner can see
 * and fix the problem (e.g. a revoked token), and login retries in the background
 * (a transient network failure at boot used to rely on the crash-restart loop).
 */
export async function boot(deps: BootDeps): Promise<void> {
  let loggedIn = true;
  try {
    await deps.login();
  } catch (err) {
    loggedIn = false;
    deps.logError(`Discord login failed (API still starting; retrying every 60s): ${err}`);
  }
  await deps.ensureGuildSettings(deps.guildId);
  deps.startApiServer();
  deps.startScheduler();
  if (!loggedIn) retryLogin(deps);
  void Promise.resolve()
    .then(() => deps.registerCommands())
    .catch((err) => deps.logError(`Command registration failed (continuing): ${err}`));
}

/** Keep retrying login on an interval until it succeeds; never throws.
 *  The in-flight guard prevents overlapping login() calls — a concurrent
 *  client.login() on a connecting client throws and destroys the socket. */
function retryLogin(deps: BootDeps, intervalMs = 60_000): void {
  let inFlight = false;
  const handle = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    void deps
      .login()
      .then(() => {
        clearInterval(handle);
        deps.logInfo('Discord login retry succeeded');
      })
      .catch((err) => deps.logError(`Discord login retry failed: ${err}`))
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);
  (handle as { unref?: () => void }).unref?.();
}
