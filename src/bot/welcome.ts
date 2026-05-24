export interface TemplateCtx {
  /** Mention string, e.g. <@123>. */
  user: string;
  username: string;
  server: string;
  memberCount: number;
}

const DEFAULT_WELCOME = 'أهلًا وسهلًا {user} في {server}! 🎉 صرت العضو رقم {memberCount}.';
const DEFAULT_GOODBYE = 'وداعًا {username} 👋 — صار عدد الأعضاء {memberCount}.';

/** Replace {user} {username} {server} {memberCount}/{count} placeholders. */
export function renderTemplate(template: string, ctx: TemplateCtx): string {
  return template
    .split('{user}').join(ctx.user)
    .split('{username}').join(ctx.username)
    .split('{server}').join(ctx.server)
    .split('{memberCount}').join(String(ctx.memberCount))
    .split('{count}').join(String(ctx.memberCount));
}

export function welcomeText(template: string | null | undefined, ctx: TemplateCtx): string {
  return renderTemplate(template?.trim() || DEFAULT_WELCOME, ctx);
}

export function goodbyeText(template: string | null | undefined, ctx: TemplateCtx): string {
  return renderTemplate(template?.trim() || DEFAULT_GOODBYE, ctx);
}
