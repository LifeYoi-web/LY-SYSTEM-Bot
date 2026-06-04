export interface TemplateCtx {
  /** Mention string, e.g. <@123>. */
  user: string;
  username: string;
  server: string;
  memberCount: number;
  /** 1-based join position in the guild (== memberCount for joins). */
  position?: number;
  /** Account creation timestamp in ms; enables {createdAt} and {accountAge}. */
  createdTimestamp?: number;
}

const DEFAULT_WELCOME = 'أهلًا وسهلًا {user} في **{server}**! 🎉 صرت العضو رقم **#{position}**.';
const DEFAULT_GOODBYE = 'وداعًا {username} 👋 — صار عدد الأعضاء **{memberCount}**.';

/** Localized human-readable account age (e.g. "٣ أشهر", "سنة", "١٤ يومًا"). */
export function formatAccountAge(createdTimestamp: number, now: number = Date.now()): string {
  const ms = Math.max(0, now - createdTimestamp);
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return 'أقل من يوم';
  if (days === 1) return 'يوم';
  if (days < 30) return `${days} يومًا`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'شهر';
  if (months < 12) return `${months} أشهر`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'سنة' : `${years} سنوات`;
}

/** Replace `{user}` `{username}` `{server}` `{memberCount}`/`{count}` `{position}` `{accountAge}` `{createdAt}`. */
export function renderTemplate(template: string, ctx: TemplateCtx): string {
  const position = ctx.position ?? ctx.memberCount;
  let out = template
    .split('{user}').join(ctx.user)
    .split('{username}').join(ctx.username)
    .split('{server}').join(ctx.server)
    .split('{memberCount}').join(String(ctx.memberCount))
    .split('{count}').join(String(ctx.memberCount))
    .split('{position}').join(String(position));
  if (ctx.createdTimestamp !== undefined) {
    out = out
      .split('{accountAge}').join(formatAccountAge(ctx.createdTimestamp))
      .split('{createdAt}').join(`<t:${Math.floor(ctx.createdTimestamp / 1000)}:R>`);
  }
  return out;
}

export function welcomeText(template: string | null | undefined, ctx: TemplateCtx): string {
  return renderTemplate(template?.trim() || DEFAULT_WELCOME, ctx);
}

export function goodbyeText(template: string | null | undefined, ctx: TemplateCtx): string {
  return renderTemplate(template?.trim() || DEFAULT_GOODBYE, ctx);
}

/**
 * Replace every `<@id>` mention with the bold username so an embedless welcome can drop
 * its ping (mention-auto-delete) while the sentence stays readable.
 */
export function stripMentionKeepName(content: string, userId: string, username: string): string {
  return content.split(`<@${userId}>`).join(`**${username}**`).trim();
}

/* ============================ welcome buttons ============================ */

export interface WelcomeButton {
  label: string;
  url: string;
  emoji?: string;
}

/** Best-effort parse + clean of a JSON value into a list of valid welcome buttons (max 5). */
export function parseWelcomeButtons(raw: unknown): WelcomeButton[] {
  if (!Array.isArray(raw)) return [];
  const out: WelcomeButton[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    if (!label || !url) continue;
    if (!/^https?:\/\//.test(url) && !url.startsWith('discord://')) continue;
    const btn: WelcomeButton = { label: label.slice(0, 80), url };
    const emoji = typeof o.emoji === 'string' ? o.emoji.trim() : '';
    if (emoji) btn.emoji = emoji.slice(0, 16);
    out.push(btn);
    if (out.length >= 5) break;
  }
  return out;
}
